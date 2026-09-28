const WEEKDAY_INDEX = {
  SUN: 0, SUNDAY: 0,
  MON: 1, MONDAY: 1,
  TUE: 2, TUES: 2, TUESDAY: 2,
  WED: 3, WEDNESDAY: 3,
  THU: 4, THUR: 4, THURS: 4, THURSDAY: 4,
  FRI: 5, FRIDAY: 5,
  SAT: 6, SATURDAY: 6
};
const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseHomeDays(value) {
  return String(value || '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .map((token) => (WEEKDAY_INDEX[token] == null ? null : WEEKDAY_NAMES[WEEKDAY_INDEX[token]]))
    .filter(Boolean)
    .filter((name, i, all) => all.indexOf(name) === i);
}

function formatHomeDays(days) {
  return (Array.isArray(days) ? days : parseHomeDays(days)).join(',');
}

function weekdayName(date) {
  return WEEKDAY_NAMES[new Date(date).getUTCDay()];
}

function hoursOfDriving(deadhead, loaded) {
  const miles = (Number(deadhead) || 0) + (Number(loaded) || 0);
  if (!miles) return 0;
  return miles / 50;
}

function startOfUtcDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function nextHomeMoment(now, homeDays) {
  const days = parseHomeDays(homeDays);
  if (!days.length) return null;
  const start = startOfUtcDay(now);
  for (let i = 0; i < 8; i++) {
    const day = new Date(start.getTime() + i * 86400000);
    if (days.includes(WEEKDAY_NAMES[day.getUTCDay()])) {
      return new Date(day.getTime() + 20 * 3600000);
    }
  }
  return null;
}

function homeTimeSkipReason(carrier, loadInfo, now = new Date()) {
  const homeDays = parseHomeDays(carrier && carrier.home_days);
  const homeState = String((carrier && carrier.home_state) || '').toUpperCase().slice(0, 2);
  const dest = String((loadInfo && loadInfo.deliveryState) || '').toUpperCase().slice(0, 2);
  if (!homeDays.length && !homeState) return null;

  const pickup = loadInfo && loadInfo.pickupDate ? new Date(loadInfo.pickupDate) : null;
  if (pickup && !Number.isNaN(pickup.getTime()) && homeDays.includes(weekdayName(pickup))) {
    if (!homeState || dest !== homeState) return 'home_day_pickup';
  }

  if (homeState && homeDays.length) {
    const homeBy = nextHomeMoment(now, homeDays);
    if (homeBy) {
      const hoursAvail = (homeBy.getTime() - now.getTime()) / 3600000;
      const hoursNeed = hoursOfDriving(loadInfo && loadInfo.deadhead, loadInfo && loadInfo.loaded);
      if (dest !== homeState && hoursNeed > Math.max(hoursAvail - 8, 0)) return 'misses_home_time';
    }
  }
  return null;
}

function homeTimeWhy(reason) {
  if (reason === 'home_day_pickup') return ' Pickup falls on a home day and the load is not heading home.';
  if (reason === 'misses_home_time') return ' The run would miss the home-time day on file.';
  return '';
}

function parseClockTime(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const ampm = (m[3] || '').toLowerCase();
  if (!Number.isFinite(hours) || hours > 23 || minutes > 59) return null;
  if (ampm.startsWith('p') && hours < 12) hours += 12;
  if (ampm.startsWith('a') && hours === 12) hours = 0;
  return { hours, minutes };
}

function combineDeliveryAt(deliveryDate, deliveryTime) {
  if (!deliveryDate) return null;
  const d = new Date(deliveryDate);
  if (Number.isNaN(d.getTime())) return null;
  const clock = parseClockTime(deliveryTime);
  if (clock) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), clock.hours, clock.minutes, 0, 0));
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 19, 0, 0, 0));
}

function hoursUntil(target, now = new Date()) {
  if (!target) return null;
  return (new Date(target).getTime() - now.getTime()) / 3600000;
}

function isEmptySoon(deliveryAt, now = new Date()) {
  const hours = hoursUntil(deliveryAt, now);
  return hours != null && hours >= 1.5 && hours <= 3.5;
}

function parseHomeRulesText(text) {
  const body = String(text || '').trim();
  const lower = body.toLowerCase();
  if (!/\bhome\b/.test(lower)) return null;
  const days = parseHomeDays(body);
  if (!days.length && !/\bhome (days?|time)\b/.test(lower)) return null;
  return { days, label: formatHomeDays(days) };
}

module.exports = {
  parseHomeDays,
  formatHomeDays,
  weekdayName,
  hoursOfDriving,
  nextHomeMoment,
  homeTimeSkipReason,
  homeTimeWhy,
  parseClockTime,
  combineDeliveryAt,
  hoursUntil,
  isEmptySoon,
  parseHomeRulesText
};
