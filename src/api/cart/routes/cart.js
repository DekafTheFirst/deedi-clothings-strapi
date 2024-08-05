'use strict';



/**
 * cart router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = {
    routes: [
        {
            method: "POST",
            path: "/carts",
            handler: "cart.create",
            config: {
            },
        },
        {
            method: 'GET',
            path: '/carts',
            handler: 'cart.find',
            config: {
                policies: [],
                middlewares: [],
            },
        },
    ],
};


