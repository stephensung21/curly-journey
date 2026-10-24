// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');

const makeConfig = require('../app.config.js');

const base = { name: 'Curly Journey', android: { package: 'com.curlyjourney.app' } };

afterEach(() => {
  delete process.env.GOOGLE_SERVICES_JSON;
  jest.restoreAllMocks();
});

it('uses the EAS file variable for googleServicesFile', () => {
  process.env.GOOGLE_SERVICES_JSON = '/tmp/eas/google-services.json';
  const out = makeConfig({ config: base });
  expect(out.android.googleServicesFile).toBe('/tmp/eas/google-services.json');
  expect(out.android.package).toBe('com.curlyjourney.app');
});

it('omits googleServicesFile when there is no variable and no local file', () => {
  jest.spyOn(fs, 'existsSync').mockReturnValue(false);
  const out = makeConfig({ config: base });
  expect('googleServicesFile' in out.android).toBe(false);
  expect(out.android.package).toBe('com.curlyjourney.app');
});

it('uses the local google-services.json when it exists', () => {
  jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  expect(makeConfig({ config: base }).android.googleServicesFile).toBe('./google-services.json');
});
