'use strict';

/**
 * stock service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock.stock', ({ strapi }) => ({
    async validateStock({ productId, size, quantity }) {
        try {
            const stock = await strapi.db.query('api::stock.stock').findOne({
                where: { product: productId, size: size },
                populate: ['product'],
            });

            if (!stock) {
                throw new Error('Stock not found');
            }

            const availableStock = stock.stock;
            if (availableStock <= 0) {
                return { status: 'out-of-stock', availableStock, productTitle: stock.product.title };
            }

            const exceedsStock = quantity > availableStock;
            return { status: exceedsStock ? 'limited' : 'available', availableStock, productTitle: stock.product.title };
        } catch (error) {
            throw new Error(`Failed to validate stock: ${error.message}`);
        }
    },

    async updateCartItem({ cartItemId, newQuantity }) {
        try {
            const updatedItem = await strapi.entityService.update('api::cart-item.cart-item', cartItemId, {
                data: { quantity: newQuantity },
            });
            return updatedItem;
        } catch (error) {
            throw new Error(`Failed to update cart item: ${error.message}`);
        }
    },

    async handleOutOfStock({ cartItemId }) {
        try {
            const updatedItem = await strapi.entityService.update('api::cart-item.cart-item', cartItemId, {
                data: { outOfStock: true },
            });
            return updatedItem;
        } catch (error) {
            throw new Error(`Failed to update item as out of stock: ${error.message}`);
        }
    },

    async addItemToCart({ cartId, productId, sizeId, quantity, localCartItemId }) {
        try {
            const newCartItem = await strapi.entityService.create('api::cart-item.cart-item', {
                data: {
                    cart: cartId,
                    product: productId,
                    quantity,
                    size: sizeId,
                    localCartItemId,
                    publishedAt: new Date(),
                },
            });
            return newCartItem;
        } catch (error) {
            throw new Error(`Failed to add item to cart: ${error.message}`);
        }
    },
}));
