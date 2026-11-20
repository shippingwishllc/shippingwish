// routes/carrier-vetting.js
// REAL FMCSA Operating Authority, Safety & Double-Brokering Risk Vetting Engine
// Uses live FMCSA QCMobile / SAFER / Census via utils/fmcsa.js + local platform verification (ZERO fake green approvals!)

const express = require('express');
const pool = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { searchFmcsa } = require('../utils/fmcsa');

const router = express.Router();

// GET /api/carrier-vetting/:mc_or_dot — Live FMCSA Authority & Safety Vetting
router.get('/:mc_or_dot', optionalAuth, async (req, res) => {
  const rawQuery = String(req.params.mc_or_dot || '').trim();
  if (!rawQuery) {
    return res.status(400).json({ error: 'MC or DOT number is required for vetting.' });
  }

  const cleanNum = rawQuery.replace(/[^0-9]/g, '');
  if (cleanNum.length < 4) {
    return res.status(400).json({ error: 'Please provide a valid MC or USDOT number (at least 4 digits).' });
  }

  try {
    // 1. Live FMCSA Lookup (QCMobile API -> SAFER -> Census)
    const fmcsaRes = await searchFmcsa(rawQuery, { allowFallback: false }).catch((err) => ({
      source: 'fmcsa_error',
      carriers: [],
      message: err.message
    }));
    const fmcsa = (fmcsaRes && Array.isArray(fmcsaRes.carriers) && fmcsaRes.carriers[0]) || null;

    // 2. Local Platform Database Lookup (Carrier profile + COI/W9 documents + fraud flags)
    let localCarrier = null;
    let uploadedDocs = [];
    let fraudFlags = [];
    try {
      const userRes = await pool.query(
        `SELECT id, name, company_name, email, phone, mc_number, dot_number, address, is_suspended, created_at
         FROM users
         WHERE (regexp_replace(COALESCE(mc_number,''), '\\D', '', 'g') = $1
                OR regexp_replace(COALESCE(dot_number,''), '\\D', '', 'g') = $1)
           AND deleted_at IS NULL
         LIMIT 1`,
        [cleanNum]
      );
      if (userRes.rows.length > 0) {
        localCarrier = userRes.rows[0];
        const docsRes = await pool.query(
          `SELECT id, category, original_name, created_at FROM documents WHERE carrier_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [localCarrier.id]
        ).catch(() => ({ rows: [] }));
        uploadedDocs = docsRes.rows || [];
      }
      const flagRes = await pool.query(
        `SELECT * FROM anti_fraud_flags WHERE target_mc ILIKE $1 OR target_dot ILIKE $1 ORDER BY created_at DESC LIMIT 5`,
        [`%${cleanNum}%`]
      ).catch(() => ({ rows: [] }));
      fraudFlags = flagRes.rows || [];
    } catch (e) {
      console.warn('[CarrierVetting] Local DB check warning:', e.message);
    }

    if (!fmcsa && !localCarrier) {
      return res.status(404).json({
        ok: false,
        verified: false,
        query: rawQuery,
        source: fmcsaRes.source || 'FMCSA',
        error: fmcsaRes.message || `No FMCSA or platform record found for ${rawQuery}. Do NOT load without manual SAFER verification.`,
        recommendation: {
          decision: 'REJECT_UNVERIFIED',
          badge: 'Unverified MC / DOT — Manual Audit Required',
          risk_score: 95,
          risk_level: 'HIGH_RISK'
        }
      });
    }

    // 3. Evaluate Real Risk Signals
    const riskFactors = [];
    let riskScore = 10;

    const allowedToOperate = fmcsa
      ? (fmcsa.allowed_to_operate === true || String(fmcsa.allowed_to_operate || '').toUpperCase() === 'Y' || String(fmcsa.status || '').toUpperCase().includes('ACTIVE'))
      : false;

    if (!fmcsa) {
      riskScore += 45;
      riskFactors.push('Live FMCSA QCMobile/SAFER record unavailable — verify manually on safer.fmcsa.dot.gov before dispatching.');
    } else if (!allowedToOperate) {
      riskScore += 75;
      riskFactors.push('FMCSA Operating Authority is NOT ACTIVE / NOT AUTHORIZED TO OPERATE.');
    }

    if (localCarrier && localCarrier.is_suspended) {
      riskScore += 80;
      riskFactors.push('Account is SUSPENDED on Shipping Wish / Loads Nexus.');
    }

    if (fraudFlags.length > 0) {
      riskScore += 70;
      riskFactors.push(`${fraudFlags.length} active anti-fraud / double-brokering alert(s) on file.`);
    }

    const bipdOnFile = Number(fmcsa?.bipd_insurance_on_file || fmcsa?.bipd_on_file || 0);
    const cargoOnFile = Number(fmcsa?.cargo_insurance_on_file || fmcsa?.cargo_on_file || 0);
    const hasCoiUploaded = uploadedDocs.some((d) => d.category === 'insurance');
    const hasW9Uploaded = uploadedDocs.some((d) => d.category === 'w9');

    if (fmcsa && bipdOnFile > 0 && bipdOnFile < 750000) {
      riskScore += 30;
      riskFactors.push(`Auto Liability BIPD on file ($${bipdOnFile.toLocaleString()}) is below federal $750,000 minimum.`);
    } else if (!hasCoiUploaded && bipdOnFile === 0) {
      riskScore += 20;
      riskFactors.push('Certificate of Insurance (COI) not yet verified on file — require ACORD 25 before releasing RateCon.');
    }

    const driverOos = Number(fmcsa?.driver_oos_rate || 0);
    const vehicleOos = Number(fmcsa?.vehicle_oos_rate || 0);
    if (vehicleOos > 30) {
      riskScore += 15;
      riskFactors.push(`Elevated FMCSA Vehicle Out-of-Service rate (${vehicleOos}%).`);
    }
    if (driverOos > 12) {
      riskScore += 15;
      riskFactors.push(`Elevated FMCSA Driver Out-of-Service rate (${driverOos}%).`);
    }

    riskScore = Math.min(100, riskScore);
    const riskLevel = riskScore >= 60 ? 'HIGH_RISK' : (riskScore >= 30 ? 'MODERATE_RISK' : 'LOW_RISK');
    const decision = riskScore >= 60 ? 'DO_NOT_LOAD' : (riskScore >= 30 ? 'REVIEW_REQUIRED' : 'APPROVED_TO_LOAD');
    const badge = decision === 'APPROVED_TO_LOAD'
      ? 'FMCSA Active — Cleared to Load'
      : (decision === 'REVIEW_REQUIRED' ? 'Verify COI / Docs Before Loading' : 'BLOCKED — High Compliance Risk');

    const vettingReport = {
      source: fmcsaRes.source || 'FMCSA Live Lookup',
      carrier_id: localCarrier ? localCarrier.id : null,
      company_name: fmcsa?.company_name || fmcsa?.legal_name || localCarrier?.company_name || localCarrier?.name || 'Unknown Carrier',
      dba_name: fmcsa?.dba_name || null,
      mc_number: fmcsa?.mc_number || localCarrier?.mc_number || `MC-${cleanNum}`,
      dot_number: fmcsa?.dot_number || localCarrier?.dot_number || `USDOT-${cleanNum}`,
      contact_phone: fmcsa?.phone || localCarrier?.phone || 'Not Listed',
      contact_email: fmcsa?.email || localCarrier?.email || 'Not Listed',
      physical_address: fmcsa?.address || localCarrier?.address || 'Not Listed',
      power_units: Number(fmcsa?.power_units || fmcsa?.total_power_units || 0),
      drivers_count: Number(fmcsa?.drivers || fmcsa?.total_drivers || 0),

      operating_authority: {
        status: fmcsa ? (allowedToOperate ? 'AUTHORIZED_FOR_HIRE' : 'NOT_AUTHORIZED_OR_INACTIVE') : 'UNVERIFIED',
        common_authority: fmcsa?.common_authority_status || (allowedToOperate ? 'ACTIVE' : 'UNKNOWN'),
        contract_authority: fmcsa?.contract_authority_status || 'UNKNOWN',
        broker_authority: fmcsa?.broker_authority_status || 'NONE'
      },

      insurance: {
        status: (bipdOnFile >= 750000 || hasCoiUploaded) ? 'ON_FILE' : 'COI_REQUIRED',
        coi_uploaded: hasCoiUploaded,
        w9_uploaded: hasW9Uploaded,
        auto_liability: {
          required: 750000,
          on_file: bipdOnFile || null,
          status: bipdOnFile >= 750000 ? 'ACTIVE' : 'VERIFY_COI'
        },
        cargo_insurance: {
          required: 100000,
          on_file: cargoOnFile || null,
          status: cargoOnFile >= 100000 ? 'ACTIVE' : 'VERIFY_COI'
        }
      },

      safety: {
        rating: fmcsa?.safety_rating || 'NOT_RATED',
        driver_oos_rate: driverOos ? `${driverOos}%` : 'Not Reported',
        vehicle_oos_rate: vehicleOos ? `${vehicleOos}%` : 'Not Reported',
        crash_history: {
          fatal: Number(fmcsa?.fatal_crash || 0),
          injury: Number(fmcsa?.inj_crash || 0),
          tow: Number(fmcsa?.towaway_crash || 0),
          total: Number(fmcsa?.crash_total || 0)
        }
      },

      fraud_risk_analysis: {
        risk_score: riskScore,
        risk_level: riskLevel,
        fraud_flags_count: fraudFlags.length,
        risk_factors: riskFactors
      },

      recommendation: {
        decision,
        badge,
        timestamp: new Date().toISOString(),
        verified_by: `LoadsNexus Live FMCSA Shield (${fmcsaRes.source || 'FMCSA'})`
      }
    };

    res.json({
      ok: true,
      verified: Boolean(fmcsa),
      query: rawQuery,
      report: vettingReport
    });
  } catch (err) {
    console.error('[CarrierVetting] Error:', err);
    res.status(500).json({ error: 'Could not perform live FMCSA carrier vetting.' });
  }
});

module.exports = router;
