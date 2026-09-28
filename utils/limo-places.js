/** Address search and the free Google map used by NYC Limo Wish booking.
 * Maps Embed API is unlimited and not billed.
 * Places Autocomplete is grouped into a free session when the same
 * session token is sent with one Place Details Essentials lookup.
 * Geocoding (10,000 free events / month) is the fallback.
 */

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

function mapsEmbedUrl({ origin, destination, waypoints } = {}) {
  const key = googleMapsKey();
  const from = String(origin || '').trim().slice(0, 300);
  const to = String(destination || '').trim().slice(0, 300);
  if (!key || !from) return null;
  if (!to) {
    return `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({ key, q: from }).toString()}`;
  }
  const params = new URLSearchParams({ key, origin: from, destination: to, mode: 'driving' });
  const stops = (Array.isArray(waypoints) ? waypoints : [])
    .map((item) => String(item || '').trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 5);
  if (stops.length) params.set('waypoints', stops.join('|'));
  return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
}

function osmEmbedUrl(points) {
  const usable = (Array.isArray(points) ? points : []).filter((point) =>
    Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  if (!usable.length) return null;
  const lats = usable.map((point) => point.lat);
  const lngs = usable.map((point) => point.lng);
  const pad = usable.length > 1 ? 0.05 : 0.02;
  const minLng = Math.min(...lngs) - pad;
  const minLat = Math.min(...lats) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const maxLat = Math.max(...lats) + pad;
  const marker = `${usable[0].lat},${usable[0].lng}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
}

function routeMap(points) {
  const list = Array.isArray(points) ? points.filter((point) => point?.formatted) : [];
  if (!list.length) return { provider: 'none', embedUrl: null };
  const google = mapsEmbedUrl({
    origin: list[0].formatted,
    destination: list.length > 1 ? list[list.length - 1].formatted : '',
    waypoints: list.slice(1, -1).map((point) => point.formatted)
  });
  if (google) return { provider: 'google_embed', embedUrl: google };
  const embedUrl = osmEmbedUrl(list);
  return embedUrl ? { provider: 'openstreetmap', embedUrl } : { provider: 'none', embedUrl: null };
}

async function autocompletePlaces(input, sessionToken) {
  const query = String(input || '').trim().slice(0, 120);
  if (query.length < 3) return [];
  const key = googleMapsKey();
  if (key) {
    try {
      return await googleAutocomplete(query, sessionToken, key);
    } catch (err) {
      console.warn('[LIMO PLACES]:', err.message);
    }
  }
  return nominatimAutocomplete(query);
}

async function googleAutocomplete(query, sessionToken, key) {
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text'
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['us'],
      languageCode: 'en',
      ...(sessionToken ? { sessionToken } : {})
    }),
    signal: AbortSignal.timeout(8000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Places autocomplete failed (${response.status})`);
  }
  return (data.suggestions || []).slice(0, 6).map((item) => {
    const prediction = item.placePrediction || {};
    const label = prediction.text?.text || '';
    if (!label) return null;
    return {
      placeId: cleanPlaceId(prediction.placeId),
      label,
      mainText: prediction.structuredFormat?.mainText?.text || label,
      secondaryText: prediction.structuredFormat?.secondaryText?.text || '',
      source: 'google_places'
    };
  }).filter(Boolean);
}

async function nominatimAutocomplete(query) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`,
    {
      headers: { 'User-Agent': 'NYC-Limo-Wish/1.0 (booking)' },
      signal: AbortSignal.timeout(8000)
    }
  );
  if (!response.ok) return [];
  const data = await response.json().catch(() => []);
  return (Array.isArray(data) ? data : []).slice(0, 5).map((item) => ({
    placeId: '',
    label: item.display_name,
    mainText: item.display_name,
    secondaryText: '',
    source: 'openstreetmap'
  })).filter((item) => item.label);
}

async function placeDetails(placeId, sessionToken) {
  const id = cleanPlaceId(placeId);
  const key = googleMapsKey();
  if (!id || !key) return null;
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  const response = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,formattedAddress,location'
    },
    signal: AbortSignal.timeout(8000)
  });
  const data = await response.json().catch(() => ({}));
  const lat = Number(data.location?.latitude);
  const lng = Number(data.location?.longitude);
  if (!response.ok || !data.formattedAddress || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, formatted: data.formattedAddress, placeId: id };
}

module.exports = {
  googleMapsKey,
  cleanPlaceId,
  cleanSessionToken,
  mapsEmbedUrl,
  osmEmbedUrl,
  routeMap,
  autocompletePlaces,
  placeDetails
};
