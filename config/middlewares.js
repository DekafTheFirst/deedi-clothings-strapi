module.exports = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  // {
  //   name: 'strapi::cors',
  //   config: {
  //     origin: ['http://localhost:5173'], // Allow your frontend URL
  //     headers: '*',
  //     credentials: true, // Allow cookies to be sent and received
  //   },
  // },
  'strapi::cors',
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
