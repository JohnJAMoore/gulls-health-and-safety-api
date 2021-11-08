interface AppConfig {
  port: string;
  pathPrefix: string;
  gazetteerBaseUrl: string;
  postcodeApiKey: string;
  databaseHost: string;
  licensingPassword: string;
  gullsPassword: string;
  roGullsPassword: string;
}

const config: AppConfig = {
  port: '3017',
  pathPrefix: '/gulls-health-and-safety-api',
  gazetteerBaseUrl: 'https://cagmap.snh.gov.uk/gazetteer',
  postcodeApiKey: process.env.POSTCODE_API_KEY ?? 'override_this_value',
  databaseHost: process.env.LICENSING_DB_HOST || 'localhost',
  licensingPassword: process.env.LICENSING_DB_PASS || 'override_this_value',
  gullsPassword: process.env.GULLS_DB_PASS || 'override_this_value',
  roGullsPassword: process.env.RO_GULLS_DB_PASS || 'override_this_value'
};

export default config;
