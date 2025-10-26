function timestamp() {
  return new Date().toISOString();
}

function logInfo(msg, meta = {}) {
  console.log(`[INFO ${timestamp()}] ${msg}` + (Object.keys(meta).length ? ` :: ${JSON.stringify(meta)}` : ''));
}

function logWarn(msg, meta = {}) {
  console.warn(`[WARN ${timestamp()}] ${msg}` + (Object.keys(meta).length ? ` :: ${JSON.stringify(meta)}` : ''));
}

function logError(msg, meta = {}) {
  console.error(`[ERROR ${timestamp()}] ${msg}` + (Object.keys(meta).length ? ` :: ${JSON.stringify(meta)}` : ''));
}

module.exports = { logInfo, logWarn, logError };
