'use strict';

/**
 * stock service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock.stock', ({ strapi }) => ({
    async validateStock({ productId, size, quantity, reserve = false }) {
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

    async reserveStock({ productId, size, quantity, userId, userName, userEmail, cartId, reservationTime }) {
        try {
            const stock = await strapi.db.query('api::stock.stock').findOne({
                where: { product: productId, size: size },
                populate: ['product'],
            });

            if (!stock) {
                throw new Error('Stock not found');
            }

            const availableStock = stock.stock;
            const reservedStock = stock.reservedStock || 0;

            if (availableStock - reservedStock < quantity) {
                return { status: 'out-of-stock', availableStock, productTitle: stock.product.title };
            }

            // Update stock reservation
            await strapi.db.query('api::stock.stock').update({
                where: { id: stock.id },
                data: {
                    reservedStock: reservedStock + quantity,
                    reservationExpiry: new Date(new Date().getTime() + reservationTime), // Reservation time in milliseconds
                    reservedForUserId: userId,
                    reservedForUserName: userName,
                    reservedForUserEmail: userEmail,
                    cartId: cartId
                },
            });

            return { status: 'reserved', availableStock: availableStock - quantity, productTitle: stock.product.title };
        } catch (error) {
            throw new Error(`Failed to reserve stock: ${error.message}`);
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
