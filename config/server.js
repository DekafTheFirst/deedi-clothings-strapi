module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('STRAPI_URL', 'https://deedis.com/server'),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});
