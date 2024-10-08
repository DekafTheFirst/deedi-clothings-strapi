module.exports = [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        directives: {
          'connect-src': ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
        },
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      origin: ['http://localhost:5173', 'https://api.deedis.com', 'https://deedis.com'],
      headers: ['Content-Type', 'Authorization', 'X-Requested-With'], // List the headers you need
      credentials: true, // Allow cookies to be sent and received
    },
  },
  
  'strapi::poweredBy',
  'strapi::query',
  {
    name: "strapi::body",
    config: {
      includeUnparsed: true,
      patchKoa: true,
      multipart: true,
    }
  },
  
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
