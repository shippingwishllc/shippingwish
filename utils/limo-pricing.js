/** NYC Limo Wish — Auto-pricing engine */

const GRATUITY_RATE = 0.20;
const TOLL_RATE_PER_MILE = 0.65;
const MIN_TOLL = 5;
const CHILD_SEAT_UNIT_PRICE = 20.00;
const MEET_AND_GREET_PRICE = 30.00;

// NYC & Tristate Airport Geofences / Profiles
const AIRPORTS = [
  {
    code: 'JFK',
    name: 'John F. Kennedy International Airport',
    lat: 40.6413, lng: -73.7781,
    radiusMiles: 3.5,
    regex: /\b(jfk|kennedy|john\s+f\.?\s*kennedy)\b/i,
    accessFee: 1.25,
    tunnelToll: 0
  },
  {
    code: 'LGA',
    name: 'LaGuardia Airport',
    lat: 40.7769, lng: -73.8740,
    radiusMiles: 2.5,
    regex: /\b(lga|laguardia|la\s+guardia)\b/i,
    accessFee: 1.25,
    tunnelToll: 0
  },
  {
    code: 'EWR',
    name: 'Newark Liberty International Airport',
    lat: 40.6895, lng: -74.1745,
    radiusMiles: 3.5,
    regex: /\b(ewr|newark(\s+liberty)?(\s+airport)?)\b/i,
    accessFee: 2.50,
    tunnelToll: 18.00 // Hudson River interstate toll (Holland/Lincoln Tunnel)
  },
  {
    code: 'TEB',
    name: 'Teterboro Airport',
    lat: 40.8501, lng: -74.0608,
    radiusMiles: 2.5,
    regex: /\b(teb|teterboro)\b/i,
    accessFee: 0,
    tunnelToll: 18.00 // NJ to NY interstate crossing
  },
  {
    code: 'HPN',
    name: 'Westchester County Airport',
    lat: 41.0669, lng: -73.7075,
    radiusMiles: 2.5,
    regex: /\b(hpn|westchester(\s+county)?(\s+airport)?)\b/i,
    accessFee: 0,
    tunnelToll: 0
  }
];

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function detectAirport(point) {
  if (!point) return null;
  const addr = String(point.address || point.formatted || '').trim();
  const lat = Number(point.lat);
  const lng = Number(point.lng);

  for (const ap of AIRPORTS) {
    if (addr && ap.regex.test(addr)) return ap;
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      const dist = haversineMiles(lat, lng, ap.lat, ap.lng);
      if (dist <= ap.radiusMiles) return ap;
    }
  }
  return null;
}

function estimateDurationMins(miles) {
  const avgSpeed = miles > 30 ? 45 : 25;
  return Math.max(15, Math.round((miles / avgSpeed) * 60));
}

function calcTolls(miles, airport = null) {
  let toll = (!miles || miles <= 0) ? MIN_TOLL : Math.max(MIN_TOLL, Math.round(miles * TOLL_RATE_PER_MILE * 100) / 100);
  if (airport && airport.tunnelToll > 0) {
    toll = Math.max(toll, airport.tunnelToll);
  }
  return Math.round(toll * 100) / 100;
}

function calcPointToPointPrice(vehicle, miles, options = {}) {
  const base = parseFloat(vehicle.base_fare);
  const perMile = parseFloat(vehicle.per_mile);
  const mult = parseFloat(vehicle.multiplier);
  const minFare = parseFloat(vehicle.min_fare);
  const mileageCharge = miles * perMile * mult;
  const subtotal = Math.max(minFare, base + mileageCharge);

  const airport = options.airport || null;
  const airportFee = airport ? (airport.accessFee || 0) : 0;
  const tolls = calcTolls(miles, airport);

  const childSeats = Math.max(0, parseInt(options.childSeats || 0, 10));
  const childSeatFee = childSeats * CHILD_SEAT_UNIT_PRICE;

  const meetAndGreet = Boolean(options.meetAndGreet);
  const meetAndGreetFee = meetAndGreet ? MEET_AND_GREET_PRICE : 0;

  const taxableTotal = subtotal + childSeatFee + meetAndGreetFee;
  const gratuity = Math.round(taxableTotal * GRATUITY_RATE * 100) / 100;
  const total = Math.round((taxableTotal + tolls + airportFee + gratuity) * 100) / 100;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tolls,
    airportFee,
    childSeats,
    childSeatFee,
    meetAndGreet,
    meetAndGreetFee,
    gratuity,
    total,
    miles,
    airport: airport ? { code: airport.code, name: airport.name } : null
  };
}

function calcHourlyPrice(vehicle, hours, options = {}) {
  const hourly = parseFloat(vehicle.hourly_rate);
  const mult = parseFloat(vehicle.multiplier);
  const minFare = parseFloat(vehicle.min_fare);
  const h = Math.max(2, parseFloat(hours) || 2);
  const subtotal = Math.max(minFare, hourly * h * mult);

  const childSeats = Math.max(0, parseInt(options.childSeats || 0, 10));
  const childSeatFee = childSeats * CHILD_SEAT_UNIT_PRICE;

  const meetAndGreet = Boolean(options.meetAndGreet);
  const meetAndGreetFee = meetAndGreet ? MEET_AND_GREET_PRICE : 0;

  const taxableTotal = subtotal + childSeatFee + meetAndGreetFee;
  const gratuity = Math.round(taxableTotal * GRATUITY_RATE * 100) / 100;
  const total = Math.round((taxableTotal + gratuity) * 100) / 100;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tolls: 0,
    airportFee: 0,
    childSeats,
    childSeatFee,
    meetAndGreet,
    meetAndGreetFee,
    gratuity,
    total,
    hours: h
  };
}

function quoteAllVehicles(vehicles, { serviceType, miles, hours, options = {} }) {
  return vehicles.map((v) => {
    const pricing = serviceType === 'hourly'
      ? calcHourlyPrice(v, hours, options)
      : calcPointToPointPrice(v, miles, options);
    return {
      id: v.id, name: v.name, models: v.models, passengers: v.passengers, luggage: v.luggage,
      badge: v.badge, image_url: v.image_url,
      pricing: { ...pricing, original: Math.round(pricing.total * 1.15 * 100) / 100, gratuity_included: true }
    };
  });
}

function generateBookingNumber() {
  return `NLW-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

module.exports = {
  haversineMiles,
  detectAirport,
  estimateDurationMins,
  calcTolls,
  calcPointToPointPrice,
  calcHourlyPrice,
  quoteAllVehicles,
  generateBookingNumber,
  CHILD_SEAT_UNIT_PRICE,
  MEET_AND_GREET_PRICE
};
