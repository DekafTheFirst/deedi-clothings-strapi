'use strict';

/**
 * stock service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock.stock', ({ strapi }) => ({
    // Assuming this is located in `api/stock/services/stock.js` or similar
    async validateCartItem({ item, userCartItemsMap = null }) {
        const { productId, size, quantity, localCartItemId, strapiCartItemId } = item;
        // console.log('userCartItemsMap', userCartItemsMap)
        try {
            // Fetch product and stock details
            const product = await strapi.query('api::product.product').findOne({ where: { id: productId } });
            if (!product) {
                return {
                    message: 'Product not found',
                    status: 'product-not-found',
                    localCartItemId,
                    productTitle: 'Unknown Product'
                };
            }

            const stock = await strapi.query('api::stock.stock').findOne({
                where: { product: productId, size: size.id },
                populate: {
                    product: {
                        fields: ['title']
                    }
                }
            });
            const availableStock = stock.stock;

            // Determine if we need to check against user cart items
            let cartItem;
            if (strapiCartItemId) {
                cartItem = userCartItemsMap
                    ? userCartItemsMap[strapiCartItemId]
                    : await strapi.query('api::cart-item.cart-item').findOne({ where: { id: strapiCartItemId } });
            }

            if (availableStock <= 0) {
                // Mark as out of stock in the cart
                if (cartItem) {
                    await strapi.entityService.update('api::cart-item.cart-item', strapiCartItemId, {
                        data: { outOfStock: true },
                    });
                }

                return {
                    message: 'Out of stock',
                    status: 'out-of-stock',
                    size: size,
                    localCartItemId,
                    productTitle: stock.product.title
                };
            }

            if (quantity > availableStock) {
                if (cartItem) {
                    await strapi.entityService.update('api::cart-item.cart-item', strapiCartItemId, {
                        data: { quantity: availableStock },
                    });
                }

                return {
                    message: "Limited Stock",
                    status: 'reduced',
                    size: size,
                    localCartItemId,
                    reducedBy: quantity - availableStock,
                    newQuantity: availableStock,
                    availableStock,
                    productTitle: stock.product.title,
                };
            }

            return {
                message: 'Success',
                status: 'success',
                availableStock,
                localCartItemId,
                productTitle: stock.product.title,
            };

        } catch (error) {
            return {
                message: `Error validating stock: ${error.message}`,
                status: 'validation-error',
                localCartItemId,
                productTitle: 'Unknown Product'
            };
        }
    },

    async batchValidateStock({ items, cartId, userId }) {
        console.log('userId', userId)
        console.log('cartId', cartId)

        try {
            const userCartItems = await strapi.db.query('api::cart-item.cart-item').findMany({
                where: {
                    cart: cartId,
                }
            });


            const userCartItemsMap = userCartItems.reduce((acc, item) => {
                acc[item.id] = item;
                return acc;
            }, {});

            const results = {
                success: [],
                reduced: [],
                outOfStock: []
            };

            // Map over items and create an array of promises for validation
            const validationPromises = items.map(async (item) => this.validateCartItem({
                item,
                userCartItemsMap
            }));




            // Wait for all validation promises to complete
            const resultsArray = await Promise.all(validationPromises);

            // Categorize results
            resultsArray.forEach(result => {
                if (result.status === 'out-of-stock') {
                    results.outOfStock.push(result);
                } else if (result.status === 'reduced') {
                    results.reduced.push(result);
                } else if (result.status === 'success') {
                    results.success.push(result);
                }
            });

            console.log('resultsArray', resultsArray)
            return results;
        }
        catch (error) {
            console.error('Error in batch stock validation:', error)
        }
    },

    // ... other methods

    async validateAndReserveStock(cartItems, userId, cartId) {
        const reservationDuration = 15 * 60 * 1000; // 15 minutes

        // Step 1: Validate Stock
        const validationResults = await this.validateStock({ items: cartItems });

        // Step 2: Check for Out-of-Stock Items
        if (validationResults.outOfStock.length > 0) {
            return {
                success: false,
                errors: validationResults.outOfStock,
            };
        }

        const results = [];

        // Step 3: Reserve Stock
        for (const item of cartItems) {
            const validation = validationResults.success.find(result => result.localCartItemId === item.localCartItemId);

            const quantityToReserve = validation.status === 'reduced' ? validation.newQuantity : item.quantity;

            await strapi.service('api::availableStock').reserveStock({
                productId: item.productId,
                size: item.size,
                quantity: quantityToReserve,
                userId,
                cartId,
                expiresAt: new Date(Date.now() + reservationDuration),
            });

            results.push({
                message: validation.status === 'reduced' ? 'Limited Stock' : 'Stock Reserved',
                status: validation.status,
                localCartItemId: item.localCartItemId,
                newQuantity: quantityToReserve,
                availableStock: validation.stock,
                productTitle: validation.productTitle,
            });
        }

        return {
            success: true,
            reservedItems: results,
        };
    },

    // async reserveStock({ productId, size, quantity, userId, userName, userEmail, cartId, reservationTime }) {
    //     try {
    //         const stock = await strapi.db.query('api::stock.stock').findOne({
    //             where: { product: productId, size: size },
    //             populate: ['product'],
    //         });

    //         if (!stock) {
    //             throw new Error('Stock not found');
    //         }

    //         const availableStock = stock.stock;
    //         const reservedStock = stock.reservedStock || 0;

    //         if (availableStock - reservedStock < quantity) {
    //             return { status: 'out-of-stock', availableStock, productTitle: stock.product.title };
    //         }

    //         // Update stock reservation
    //         await strapi.db.query('api::stock.stock').update({
    //             where: { id: stock.id },
    //             data: {
    //                 reservedStock: reservedStock + quantity,
    //                 reservationExpiry: new Date(new Date().getTime() + reservationTime), // Reservation time in milliseconds
    //                 reservedForUserId: userId,
    //                 reservedForUserName: userName,
    //                 reservedForUserEmail: userEmail,
    //                 cartId: cartId
    //             },
    //         });

    //         return { status: 'reserved', availableStock: availableStock - quantity, productTitle: stock.product.title };
    //     } catch (error) {
    //         throw new Error(`Failed to reserve stock: ${error.message}`);
    //     }
    // },




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
