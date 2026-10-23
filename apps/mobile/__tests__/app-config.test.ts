const makeConfig = require('../app.config.js');

const base = { name: 'Curly Journey', android: { package: 'com.curlyjourney.app' } };

afterEach(() => {
  delete process.env.GOOGLE_SERVICES_JSON;
});

it('uses the EAS file variable for googleServicesFile', () => {
  process.env.GOOGLE_SERVICES_JSON = '/tmp/eas/google-services.json';
  const out = makeConfig({ config: base });
  expect(out.android.googleServicesFile).toBe('/tmp/eas/google-services.json');
  expect(out.android.package).toBe('com.curlyjourney.app');
});

it('falls back to a local google-services.json', () => {
  expect(makeConfig({ config: base }).android.googleServicesFile).toBe('./google-services.json');
});
