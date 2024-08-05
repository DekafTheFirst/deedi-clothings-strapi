const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::cart.cart', ({ strapi }) => ({
    async create(ctx) {
        const userId = ctx.request.body.userId
        if (!userId) {
            return ctx.badRequest('User ID is required');
        }
        // Check if the user already has a cart
        let cart = await strapi.db.query('api::cart.cart').findOne({
            where: { user: userId }, // Properly query the relational user field
        });

        if (!cart) {
            // Create a new cart if it doesn't exist
            cart = await strapi.db.query('api::cart.cart').create({
                data: {
                    user: userId,
                    items: [],
                    publishedAt: new Date(), // Set the publishedAt field to publish the cart
                    // Initialize with an empty array or as per your requirements
                },
            });
        }

        // Return the cart
        ctx.body = cart;
    },

}));
