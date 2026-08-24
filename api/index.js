let app;
let initError = null;

try {
  app = require('../server');
} catch (err) {
  console.error('Fatal initialization error loading server.js:', err);
  initError = err;
}

module.exports = (req, res) => {
  if (initError || !app) {
    return res.status(500).json({
      error: 'Server initialization failed on Vercel.',
      message: initError ? initError.message : 'App module not loaded',
      stack: initError ? initError.stack : null
    });
  }
  return app(req, res);
};
