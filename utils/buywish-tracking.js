function cleanMetaPixelId(value) {
  const id = String(value == null ? '' : value).trim();
  if (!id) return '';
  return /^\d{6,20}$/.test(id) ? id : null;
}

function cleanGoogleTagId(value) {
  const id = String(value == null ? '' : value).trim().toUpperCase();
  if (!id) return '';
  if (/^G-[A-Z0-9]{4,20}$/.test(id)) return id;
  if (/^AW-\d{6,20}$/.test(id)) return id;
  if (/^GTM-[A-Z0-9]{4,12}$/.test(id)) return id;
  return null;
}

module.exports = { cleanMetaPixelId, cleanGoogleTagId };
