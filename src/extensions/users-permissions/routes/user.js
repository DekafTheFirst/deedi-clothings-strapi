// src/extensions/users-permissions/routes/user.js
const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::user.user', {
    config: {
        find: {
            auth: false,
            middlewares: ['global::verifyFirebaseToken'],
        },
        findOne: {
            auth: false,
            middlewares: ['global::verifyFirebaseToken'],
        },
        update: {
            auth: false,
            middlewares: ['global::verifyFirebaseToken'],
        },
        // Add other actions and middlewares as needed
    },
});
