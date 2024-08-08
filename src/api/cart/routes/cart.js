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
            method: 'PUT',
            path: '/carts/:id',
            handler: 'cart.update',
            config: {
                policies: [],
                middlewares: [],
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
        {
            method: 'PUT',
            path: '/carts/:cartId/items/:cartItemId',
            handler: 'cart.updateCartItem',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'POST',
            path: '/carts/:cartId/items',
            handler: 'cart.addItemToCart',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'DELETE',
            path: '/carts/:cartId/items/:itemId',
            handler: 'cart.removeItemFromCart',
            config: {
                policies: [],
                middlewares: [],
            },
        },
    ],
};


