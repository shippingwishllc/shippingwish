/** Street suggestions for BuyWish checkout.
 * Uses the server Google Places key when it is set, then OpenStreetMap.
 * The browser never receives the key.
 */

const SHIP_COUNTRIES = ['US', 'CA', 'GB'];

function googleMapsKey() {
  return String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
}

function cleanPlaceId(value) {
  const id = String(value || '').replace(/^places\//, '').trim();
  return /^[A-Za-z0-9_-]{8,250}$/.test(id) ? id : '';
}

function cleanSessionToken(value) {
  const token = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ? token : '';
}

function shipCountry(value) {
  const code = String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return SHIP_COUNTRIES.includes(code) ? code : '';
}

function componentText(components, type, short) {
  const row = (components || []).find((item) => Array.isArray(item.types) && item.types.includes(type));
  if (!row) return '';
  return String((short ? row.shortText || row.longText : row.longText || row.shortText) || '').trim();
}

function fromGoogleComponents(components, formatted) {
  const line1 = [componentText(components, 'street_number'), componentText(components, 'route')].filter(Boolean).join(' ');
  const city = componentText(components, 'locality')
    || componentText(components, 'postal_town')
    || componentText(components, 'sublocality')
    || componentText(components, 'administrative_area_level_2');
  return {
    line1: line1 || String(formatted || '').split(',')[0].trim(),
    city,
    state: componentText(components, 'administrative_area_level_1', true),
    postal: componentText(components, 'postal_code'),
    country: shipCountry(componentText(components, 'country', true))
  };
}

function fromNominatim(item) {
  const address = item && item.address ? item.address : {};
  const city = address.city || address.town || address.village || address.hamlet || address.municipality || '';
  const line1 = [address.house_number, address.road].filter(Boolean).join(' ')
    || String(item.display_name || '').split(',')[0].trim();
  return {
    label: String(item.display_name || line1),
    placeId: '',
    line1,
    city: String(city),
    state: String(address.state || address.state_district || address.region || ''),
    postal: String(address.postcode || ''),
    country: shipCountry(address.country_code)
  };
}

function cleanShipTo(customer) {
  const source = customer || {};
  const country = shipCountry(source.country || 'US') || '';
  const line1 = String(source.address || '').trim().slice(0, 200);
  const city = String(source.city || '').trim().slice(0, 80);
  const state = String(source.state || '').trim().slice(0, 40);
  const postal = String(source.postal || source.zip || '').trim().slice(0, 16);
  const note = String(source.note || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!country) return { error: 'We ship to the USA, Canada, and the United Kingdom.' };
  if (line1.length < 4) return { error: 'Enter a street address.' };
  if (city.length < 2) return { error: 'Enter a city.' };
  if ((country === 'US' || country === 'CA') && state.length < 2) return { error: 'Enter a state or province.' };
  if (postal.length < 3) return { error: 'Enter a ZIP or postal code.' };
  return { line1, city, state, postal, country, note };
}

async function googleSuggest(query, sessionToken, key) {
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text'
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['us', 'ca', 'gb'],
      languageCode: 'en',
      ...(sessionToken ? { sessionToken } : {})
    }),
    signal: AbortSignal.timeout(8000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Places autocomplete failed (${response.status})`);
  return (data.suggestions || []).slice(0, 6).map((item) => {
    const prediction = item.placePrediction || {};
    const label = prediction.text?.text || '';
    const placeId = cleanPlaceId(prediction.placeId);
    if (!label || !placeId) return null;
    return {
      label,
      placeId,
      mainText: prediction.structuredFormat?.mainText?.text || label,
      secondaryText: prediction.structuredFormat?.secondaryText?.text || '',
      line1: '',
      city: '',
      state: '',
      postal: '',
      country: ''
    };
  }).filter(Boolean);
}

async function nominatimSuggest(query) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us,ca,gb`,
    {
      headers: { 'User-Agent': 'BuyWishOnline/1.0 (https://www.buywishonline.com)' },
      signal: AbortSignal.timeout(8000)
    }
  );
  if (!response.ok) return [];
  const data = await response.json().catch(() => []);
  return (Array.isArray(data) ? data : []).slice(0, 5).map(fromNominatim).filter((item) => item.line1 && item.label);
}

async function suggestAddresses(input, sessionToken) {
  const query = String(input || '').trim().slice(0, 120);
  if (query.length < 3) return [];
  const token = cleanSessionToken(sessionToken);
  const key = googleMapsKey();
  if (key) {
    try {
      const google = await googleSuggest(query, token, key);
      if (google.length) return google;
    } catch (err) {
      console.warn('[BUYWISH ADDRESS]:', err.message);
    }
  }
  return nominatimSuggest(query);
}

async function completeAddress(placeId, sessionToken) {
  const id = cleanPlaceId(placeId);
  const key = googleMapsKey();
  if (!id || !key) return null;
  const token = cleanSessionToken(sessionToken);
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
  if (token) url.searchParams.set('sessionToken', token);
  const response = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'formattedAddress,addressComponents'
    },
    signal: AbortSignal.timeout(8000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.formattedAddress) return null;
  const parsed = fromGoogleComponents(data.addressComponents || [], data.formattedAddress);
  if (!parsed.country) return null;
  return { ...parsed, label: data.formattedAddress, placeId: id };
}

module.exports = {
  SHIP_COUNTRIES,
  googleMapsKey,
  cleanPlaceId,
  fromGoogleComponents,
  fromNominatim,
  cleanShipTo,
  suggestAddresses,
  completeAddress
};
