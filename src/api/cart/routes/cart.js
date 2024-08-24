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
            path: '/carts/fetchAndMergeCart/:userId',
            handler: 'cart.fetchAndMergeCart',
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
            method: 'PATCH',
            path: '/carts/updateCartItem/:strapiCartItemId',
            handler: 'cart.updateCartItem',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'PATCH',
            path: '/carts/validate-stock',
            handler: 'cart.validateStock',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'POST',
            path: '/carts/addItem',
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


