'use strict';


const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::order.order', {
    config: {
        create: {
            policies: [],
            middlewares: [],
        },
        
    },

});
