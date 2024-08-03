'use strict';



/**
 * cart router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = {
    routes: [
        {
            method: "POST",
            path: "/cart",
            handler: "cart.create",
            config: {
            },
        },
    ],
};


