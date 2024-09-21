module.exports = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: ['https://deedis.com', 'https://www.deedis.com', 'http://localhost:5173'],
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
