/** NYC Limo Wish — Auto-pricing engine */

const GRATUITY_RATE = 0.20;
const TOLL_RATE_PER_MILE = 0.65;
const MIN_TOLL = 5;

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDurationMins(miles) {
  const avgSpeed = miles > 30 ? 45 : 25;
  return Math.max(15, Math.round((miles / avgSpeed) * 60));
}

function calcTolls(miles) {
  if (!miles || miles <= 0) return MIN_TOLL;
  return Math.max(MIN_TOLL, Math.round(miles * TOLL_RATE_PER_MILE * 100) / 100);
}

function calcPointToPointPrice(vehicle, miles) {
  const base = parseFloat(vehicle.base_fare);
  const perMile = parseFloat(vehicle.per_mile);
  const mult = parseFloat(vehicle.multiplier);
  const minFare = parseFloat(vehicle.min_fare);
  const mileageCharge = miles * perMile * mult;
  const subtotal = Math.max(minFare, base + mileageCharge);
  const tolls = calcTolls(miles);
  const gratuity = Math.round(subtotal * GRATUITY_RATE * 100) / 100;
  return { subtotal, tolls, gratuity, total: Math.round((subtotal + tolls + gratuity) * 100) / 100, miles };
}

function calcHourlyPrice(vehicle, hours) {
  const hourly = parseFloat(vehicle.hourly_rate);
  const mult = parseFloat(vehicle.multiplier);
  const minFare = parseFloat(vehicle.min_fare);
  const h = Math.max(2, parseFloat(hours) || 2);
  const subtotal = Math.max(minFare, hourly * h * mult);
  const gratuity = Math.round(subtotal * GRATUITY_RATE * 100) / 100;
  return { subtotal, tolls: 0, gratuity, total: Math.round((subtotal + gratuity) * 100) / 100, hours: h };
}

function quoteAllVehicles(vehicles, { serviceType, miles, hours }) {
  return vehicles.map((v) => {
    const pricing = serviceType === 'hourly' ? calcHourlyPrice(v, hours) : calcPointToPointPrice(v, miles);
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

module.exports = { haversineMiles, estimateDurationMins, calcPointToPointPrice, calcHourlyPrice, quoteAllVehicles, generateBookingNumber };
