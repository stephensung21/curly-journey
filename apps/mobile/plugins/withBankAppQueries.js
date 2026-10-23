const { withAndroidManifest } = require('expo/config-plugins');

// Keep in sync with BANK_APPS in src/lib/bankApps.ts (a unit test asserts they match).
const BANK_PACKAGES = ['com.commbank.netbank', 'com.americanexpress.android.acctsvcs.au', 'au.com.up.money'];

// Android 11+ package visibility: lets openApplication() see the bank apps.
function addBankAppQueries(modResults) {
  const manifest = modResults.manifest;
  if (!manifest.queries) manifest.queries = [];
  const existing = new Set(
    manifest.queries.flatMap(q => (q.package ?? []).map(p => p.$['android:name'])),
  );
  const missing = BANK_PACKAGES.filter(p => !existing.has(p));
  if (missing.length === 0) return modResults;
  let target = manifest.queries.find(q => Array.isArray(q.package));
  if (!target) {
    target = { package: [] };
    manifest.queries.push(target);
  }
  for (const name of missing) target.package.push({ $: { 'android:name': name } });
  return modResults;
}

const withBankAppQueries = config =>
  withAndroidManifest(config, mod => {
    mod.modResults = addBankAppQueries(mod.modResults);
    return mod;
  });

module.exports = withBankAppQueries;
module.exports.addBankAppQueries = addBankAppQueries;
module.exports.BANK_PACKAGES = BANK_PACKAGES;
