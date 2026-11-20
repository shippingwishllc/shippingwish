// utils/profit-engine.js
// True USA Trucking Net-Profit Load Calculator & Market Intelligence Engine
// Computes real carrier take-home profit after Deadhead, Regional Diesel, Tolls, and Fees.

const REGIONAL_DIESEL_PRICES = {
  // West Coast / CA (PADD 5)
  CA: 4.89, WA: 4.45, OR: 4.18, NV: 4.05, AZ: 3.88,
  // Northeast (PADD 1A/1B)
  PA: 4.12, NY: 4.08, NJ: 3.92, CT: 4.05, MA: 3.98, MD: 3.85, DE: 3.80,
  // Midwest (PADD 2)
  IL: 3.84, IN: 3.82, OH: 3.76, MI: 3.78, WI: 3.68, MN: 3.66, IA: 3.58, MO: 3.54, KS: 3.56, KY: 3.62,
  // Southeast (PADD 1C)
  GA: 3.64, FL: 3.68, NC: 3.66, SC: 3.58, TN: 3.55, AL: 3.56, VA: 3.68, MS: 3.49,
  // Gulf / South Central (PADD 3)
  TX: 3.42, LA: 3.44, OK: 3.45, AR: 3.48, NM: 3.62,
  // Mountain (PADD 4)
  CO: 3.65, UT: 3.72, WY: 3.68, MT: 3.74, ID: 3.79
};

const HIGH_TOLL_STATES = new Set(['PA', 'NY', 'NJ', 'IL', 'IN', 'OH', 'MA', 'CT', 'DE', 'MD', 'FL', 'OK', 'KS', 'TX']);

function extractStateCode(loc) {
  const s = String(loc || '').toUpperCase();
  const m = s.match(/,\s*([A-Z]{2})\b/) || s.match(/\b([A-Z]{2})\s*\d{5}\b/) || s.match(/\b([A-Z]{2})$/);
  return m ? m[1] : null;
}

function defaultMpgForEquipment(equipmentType) {
  const eq = String(equipmentType || '').toLowerCase();
  if (eq.includes('cargo') || eq.includes('sprinter')) return 15.0;
  if (eq.includes('box') || eq.includes('straight')) return 9.5;
  if (eq.includes('hotshot') || eq.includes('hot shot')) return 9.0;
  if (eq.includes('reefer') || eq.includes('refrig')) return 6.0; // Includes reefer unit burn
  if (eq.includes('flat') || eq.includes('step') || eq.includes('rgn')) return 6.2;
  return 6.5; // Standard 53ft Dry Van Class 8
}

function getRegionalDieselPrice(origin, destination) {
  const oSt = extractStateCode(origin);
  const dSt = extractStateCode(destination);
  const p1 = (oSt && REGIONAL_DIESEL_PRICES[oSt]) || 3.72;
  const p2 = (dSt && REGIONAL_DIESEL_PRICES[dSt]) || p1;
  return Number(((p1 + p2) / 2).toFixed(2));
}

function estimateTolls(origin, destination, loadedMiles) {
  const oSt = extractStateCode(origin);
  const dSt = extractStateCode(destination);
  let tollFactor = 0.03; // baseline $0.03/mi
  if (HIGH_TOLL_STATES.has(oSt) || HIGH_TOLL_STATES.has(dSt)) tollFactor = 0.09;
  if (['NY', 'NJ', 'PA', 'MA'].includes(oSt) && ['NY', 'NJ', 'PA', 'MA'].includes(dSt)) {
    tollFactor = 0.18; // Northeast corridor turnpike + bridge tolls
  }
  return Number((loadedMiles * tollFactor).toFixed(2));
}

/**
 * Compute True Net Profit, Effective RPM (including deadhead), Fuel Cost, and AI Profit Verdict.
 */
function analyzeLoadProfit({
  rate = 0,
  loadedMiles = 0,
  deadheadMiles = 0,
  origin = '',
  destination = '',
  equipmentType = '53ft Dry Van',
  mpg = null,
  dieselPrice = null,
  factoringPercent = 2.0,
  dispatchFeeFlat = 0,
  dispatchPercent = 0,
  fixedCostPerMile = 0.42 // Maintenance + tires + insurance reserve
}) {
  const grossRate = Math.max(0, Number(rate) || 0);
  const loaded = Math.max(1, Number(loadedMiles) || 1);
  const deadhead = Math.max(0, Number(deadheadMiles) || 0);
  const totalMiles = loaded + deadhead;

  const truckMpg = Number(mpg) > 0 ? Number(mpg) : defaultMpgForEquipment(equipmentType);
  const fuelPrice = Number(dieselPrice) > 0 ? Number(dieselPrice) : getRegionalDieselPrice(origin, destination);

  const fuelGallons = Number((totalMiles / truckMpg).toFixed(1));
  const fuelCost = Number((fuelGallons * fuelPrice).toFixed(2));
  const tollsEst = estimateTolls(origin, destination, loaded);
  const factoringFee = Number(((grossRate * Math.max(0, Number(factoringPercent) || 0)) / 100).toFixed(2));
  const dispatchCost = Number((Number(dispatchFeeFlat || 0) + (grossRate * Number(dispatchPercent || 0)) / 100).toFixed(2));
  const maintenanceReserve = Number((totalMiles * fixedCostPerMile).toFixed(2));

  const directTripExpenses = Number((fuelCost + tollsEst + factoringFee + dispatchCost).toFixed(2));
  const netBeforeReserve = Number((grossRate - directTripExpenses).toFixed(2));
  const trueNetProfit = Number((grossRate - directTripExpenses - maintenanceReserve).toFixed(2));

  const loadedRpm = Number((grossRate / loaded).toFixed(2));
  const effectiveRpm = Number((grossRate / totalMiles).toFixed(2));
  const netProfitPerMile = Number((trueNetProfit / totalMiles).toFixed(2));
  const marginPct = grossRate > 0 ? Math.round((trueNetProfit / grossRate) * 100) : 0;

  let verdict = 'SOLID';
  let verdictLabel = '✅ Solid Margin';
  let verdictColor = '#16A34A';

  if (trueNetProfit <= 0 || netProfitPerMile < 0.35) {
    verdict = 'LOSS_WARNING';
    verdictLabel = '🚨 Low / Negative Margin';
    verdictColor = '#DC2626';
  } else if (netProfitPerMile >= 1.45 && effectiveRpm >= 2.65) {
    verdict = 'HIGH_PROFIT';
    verdictLabel = '🔥 High Profit Load';
    verdictColor = '#059669';
  } else if (netProfitPerMile < 0.85) {
    verdict = 'LOW_MARGIN';
    verdictLabel = '⚠️ Tight Margin — Negotiate Up';
    verdictColor = '#D97706';
  }

  // Suggested counter-offer target if margin is tight
  const targetEffectiveRpm = Math.max(effectiveRpm, equipmentType.toLowerCase().includes('reefer') ? 2.95 : 2.55);
  const suggestedCounterRate = Math.ceil((targetEffectiveRpm * totalMiles) / 25) * 25;

  return {
    gross_rate: grossRate,
    loaded_miles: loaded,
    deadhead_miles: deadhead,
    total_miles: totalMiles,
    loaded_rpm: loadedRpm,
    effective_rpm: effectiveRpm,
    diesel_price: fuelPrice,
    truck_mpg: truckMpg,
    fuel_gallons: fuelGallons,
    fuel_cost: fuelCost,
    tolls_est: tollsEst,
    factoring_fee: factoringFee,
    dispatch_cost: dispatchCost,
    maintenance_reserve: maintenanceReserve,
    net_cash_after_fuel: netBeforeReserve,
    true_net_profit: trueNetProfit,
    net_profit_per_mile: netProfitPerMile,
    margin_percent: marginPct,
    verdict,
    verdict_label: verdictLabel,
    verdict_color: verdictColor,
    suggested_counter_rate: suggestedCounterRate > grossRate ? suggestedCounterRate : grossRate
  };
}

function formatPostedAge(createdAt) {
  if (!createdAt) return 'Recently';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

module.exports = {
  analyzeLoadProfit,
  formatPostedAge,
  getRegionalDieselPrice,
  defaultMpgForEquipment
};
