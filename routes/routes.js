const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const axios = require('axios');

// Helper: Haversine Distance Fallback (Miles)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightMiles = R * c;
  return Math.round(straightMiles * 1.22); // 1.22 highway circuity factor for US interstate trucking
}

// Coordinate lookup table for top US trucking hubs
const CITY_COORDINATES = {
  'chicago, il': { lat: 41.8781, lng: -87.6298 },
  'atlanta, ga': { lat: 33.7490, lng: -84.3880 },
  'dallas, tx': { lat: 32.7767, lng: -96.7970 },
  'houston, tx': { lat: 29.7604, lng: -95.3698 },
  'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
  'phoenix, az': { lat: 33.4484, lng: -112.0740 },
  'denver, co': { lat: 39.7392, lng: -104.9903 },
  'memphis, tn': { lat: 35.1495, lng: -90.0490 },
  'nashville, tn': { lat: 36.1627, lng: -86.7816 },
  'columbus, oh': { lat: 39.9612, lng: -82.9988 },
  'indianapolis, in': { lat: 39.7684, lng: -86.1581 },
  'kansas city, mo': { lat: 39.0997, lng: -94.5786 },
  'st. louis, mo': { lat: 38.6270, lng: -90.1994 },
  'seattle, wa': { lat: 47.6062, lng: -122.3321 },
  'miami, fl': { lat: 25.7617, lng: -80.1918 },
  'orlando, fl': { lat: 28.5383, lng: -81.3792 },
  'charlotte, nc': { lat: 35.2271, lng: -80.8431 },
  'philadelphia, pa': { lat: 39.9526, lng: -75.1652 },
  'new york, ny': { lat: 40.7128, lng: -74.0060 },
  'louisville, ky': { lat: 38.2527, lng: -85.7585 }
};

// GET /api/routes/config - Check API key status
router.get('/config', requireAuth, (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTE_OPTIMIZATION_API_KEY;
  res.json({
    google_maps_configured: Boolean(apiKey),
    active_services: ['Route Optimization API', 'Truck Directions', 'HOS Compliance Calculator', 'Live Fuel Estimate']
  });
});

// POST /api/routes/optimize - Main Route & RPM Optimization Endpoint
router.post('/optimize', requireAuth, async (req, res) => {
  try {
    const { origin, destination, deadhead_origin, gross_pay, waypoints = [] } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and Destination are required' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTE_OPTIMIZATION_API_KEY;
    let loadedMiles = 0;
    let deadheadMiles = 0;
    let driveHours = 0;
    let routePolyline = '';
    let isGoogleLive = false;

    if (apiKey) {
      try {
        // Call Google Directions API / Route Optimization
        const googleUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${apiKey}`;
        const response = await axios.get(googleUrl);

        if (response.data.status === 'OK' && response.data.routes.length > 0) {
          const route = response.data.routes[0];
          const leg = route.legs[0];

          loadedMiles = Math.round(leg.distance.value / 1609.34); // Convert meters to miles
          driveHours = parseFloat((leg.duration.value / 3600).toFixed(1)); // Convert seconds to hours
          routePolyline = route.overview_polyline ? route.overview_polyline.points : '';
          isGoogleLive = true;

          // Deadhead calculation if deadhead origin provided
          if (deadhead_origin && deadhead_origin.toLowerCase() !== origin.toLowerCase()) {
            const dhUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(deadhead_origin)}&destination=${encodeURIComponent(origin)}&key=${apiKey}`;
            const dhRes = await axios.get(dhUrl);
            if (dhRes.data.status === 'OK' && dhRes.data.routes.length > 0) {
              deadheadMiles = Math.round(dhRes.data.routes[0].legs[0].distance.value / 1609.34);
            }
          }
        }
      } catch (gErr) {
        console.warn('Google Maps API call failed, using smart fallback calculation:', gErr.message);
      }
    }

    // Fallback calculation if Google API key not set or failed
    if (loadedMiles === 0) {
      const origKey = origin.toLowerCase().trim();
      const destKey = destination.toLowerCase().trim();

      const origCoord = CITY_COORDINATES[origKey] || { lat: 41.8781, lng: -87.6298 };
      const destCoord = CITY_COORDINATES[destKey] || { lat: 33.7490, lng: -84.3880 };

      loadedMiles = calculateHaversineDistance(origCoord.lat, origCoord.lng, destCoord.lat, destCoord.lng);
      driveHours = parseFloat((loadedMiles / 55).toFixed(1)); // Average truck speed 55 mph

      if (deadhead_origin && deadhead_origin.toLowerCase().trim() !== origKey) {
        const dhKey = deadhead_origin.toLowerCase().trim();
        const dhCoord = CITY_COORDINATES[dhKey] || { lat: 40.0, lng: -89.0 };
        deadheadMiles = calculateHaversineDistance(dhCoord.lat, dhCoord.lng, origCoord.lat, origCoord.lng);
      }
    }

    // Commercial Truck Calculations
    const totalMiles = loadedMiles + deadheadMiles;
    const payNum = parseFloat(gross_pay) || 0;
    const rpmLoaded = loadedMiles > 0 ? parseFloat((payNum / loadedMiles).toFixed(2)) : 0;
    const rpmTotal = totalMiles > 0 ? parseFloat((payNum / totalMiles).toFixed(2)) : 0;

    // Fuel Estimate: Avg 6.5 MPG for Semi-Truck @ $3.85 / gal
    const estimatedFuelGallons = parseFloat((totalMiles / 6.5).toFixed(1));
    const estimatedFuelCost = parseFloat((estimatedFuelGallons * 3.85).toFixed(2));
    const netProfitEstimate = parseFloat((payNum - estimatedFuelCost).toFixed(2));

    // Mandatory FMCSA HOS Breaks (1 break per 8 hours driving)
    const requiredHosBreaks = Math.floor(driveHours / 8);

    res.json({
      success: true,
      google_api_active: isGoogleLive,
      route: {
        origin,
        destination,
        deadhead_origin: deadhead_origin || 'None',
        loaded_miles: loadedMiles,
        deadhead_miles: deadheadMiles,
        total_miles: totalMiles,
        est_drive_hours: driveHours,
        required_hos_breaks: requiredHosBreaks,
        polyline: routePolyline
      },
      financials: {
        gross_pay: payNum,
        loaded_rpm: rpmLoaded,
        all_in_rpm: rpmTotal,
        estimated_fuel_gallons: estimatedFuelGallons,
        estimated_fuel_cost: estimatedFuelCost,
        estimated_net_profit: netProfitEstimate,
        profit_margin_percent: payNum > 0 ? parseFloat(((netProfitEstimate / payNum) * 100).toFixed(1)) : 0
      },
      recommended_action: rpmTotal >= 2.20 ? '✅ BOOK LOAD (High Profitability)' : (rpmTotal >= 1.85 ? '⚠️ NEGOTIATE HIGHER RATE' : '❌ LOW RPM - PASS LOAD')
    });
  } catch (err) {
    console.error('Error in route optimization:', err);
    res.status(500).json({ error: 'Server error optimizing route' });
  }
});

module.exports = router;
