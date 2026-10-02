/**
 * scripts/test-google-maps-integration.js
 * Verification of Google Maps Platform Integration across Shipping Wish & LoadsNexus
 */

require('dotenv').config();
const gm = require('../utils/google-maps');

async function run() {
  console.log('======================================================');
  console.log('  Testing Google Maps Platform API Suite');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // 1. Check API Key configuration
  const key = gm.googleMapsKey();
  assert(Boolean(key) && key.startsWith('AIzaSy'), 'Google Maps API Key is active in environment');

  // 2. Test Google Routes API (New v2)
  try {
    const route = await gm.computeHighwayRoute('Hopkinsville, KY', 'Dibersville, MS');
    assert(Boolean(route) && route.miles > 500 && route.miles < 650, `Routes API computed highway mileage: ${route ? route.miles : 0} miles`);
    assert(Boolean(route) && route.hours > 7 && route.hours < 10, `Routes API computed drive time: ${route ? route.hours : 0} hours`);
    assert(Boolean(route) && Boolean(route.polyline), 'Routes API returned polyline path');
    assert(route && route.isGoogleLive === true, 'Routes API marked as live Google provider');
  } catch (err) {
    assert(false, `Routes API error: ${err.message}`);
  }

  // 3. Test Places API (New) Autocomplete
  try {
    const places = await gm.searchPlaceAutocomplete('Atlanta GA');
    assert(Array.isArray(places) && places.length > 0, `Places API returned ${places.length} autocomplete suggestions`);
    assert(places[0] && places[0].description.includes('Atlanta'), `Top place suggestion resolved: ${places[0] ? places[0].description : ''}`);
  } catch (err) {
    assert(false, `Places API error: ${err.message}`);
  }

  // 4. Test Geocoding API
  try {
    const geo = await gm.geocodeAddress('42240');
    assert(Boolean(geo) && geo.state === 'KY', `Geocoding resolved ZIP 42240 to ${geo ? geo.city + ', ' + geo.state : 'None'}`);
    assert(Boolean(geo) && typeof geo.lat === 'number', `Geocoding resolved coordinates: ${geo ? geo.lat + ',' + geo.lng : 'None'}`);
  } catch (err) {
    assert(false, `Geocoding API error: ${err.message}`);
  }

  // 5. Test Maps Embed API Directions URL
  try {
    const embedUrl = gm.getEmbedDirectionsUrl({
      origin: 'Hopkinsville, KY',
      destination: 'Dibersville, MS'
    });
    assert(Boolean(embedUrl) && embedUrl.includes('https://www.google.com/maps/embed/v1/directions'), 'Google Maps Embed URL generated for live broker tracking');
    assert(embedUrl.includes('Hopkinsville') && embedUrl.includes('Dibersville'), 'Embed URL encodes correct origin and destination parameters');
  } catch (err) {
    assert(false, `Maps Embed API error: ${err.message}`);
  }

  console.log('\n======================================================');
  console.log(`  Google Maps Tests: ${passed}/${total} Passed (${Math.round((passed/total)*100)}%)`);
  console.log('======================================================\n');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
