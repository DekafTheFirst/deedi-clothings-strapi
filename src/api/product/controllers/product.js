'use strict';

/**
 * product controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::product.product', ({ strapi }) => ({
    async create(ctx) {
        const { name, description, price } = ctx.request.body;

        try {
            // Create product in Stripe
            const stripeProduct = await stripe.products.create({
                name,
                description,
            });

            // Create price in Stripe
            const stripePrice = await stripe.prices.create({
                product: stripeProduct.id,
                unit_amount: Math.round(price * 100),
                currency: 'usd',
            });

            // Save product and Stripe IDs in Strapi
            const newProduct = await strapi.service('api::product.product').create({
                data: {
                    name,
                    description,
                    price,
                    stripeProductId: stripeProduct.id,
                    stripePriceId: stripePrice.id,
                },
            });

            ctx.send(newProduct);
        } catch (error) {
            console.error('Failed to create product:', error);
            ctx.throw(400, 'Product creation failed');
        }
    },
}));
