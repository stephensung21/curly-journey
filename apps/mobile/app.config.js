const fs = require('fs');
const path = require('path');

// Only point at a Firebase file when one exists (EAS file variable or a local file),
// so an APK can still be built before Firebase is set up.
module.exports = ({ config }) => {
  const fromEnv = process.env.GOOGLE_SERVICES_JSON;
  const hasLocal = !fromEnv && fs.existsSync(path.join(__dirname, 'google-services.json'));
  const file = fromEnv ?? (hasLocal ? './google-services.json' : undefined);
  return { ...config, android: { ...config.android, ...(file ? { googleServicesFile: file } : {}) } };
};
