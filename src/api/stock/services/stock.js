'use strict';


/**
 * stock service
 */

const { errors } = require('@strapi/utils');
const { ApplicationError } = errors;
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
                    status: 'out-of-stock',
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
            if (!stock) {
                return {
                    message: 'Stock not found',
                    status: 'out-of-stock',
                    localCartItemId,
                    productTitle: 'Unknown Product'
                };
            }
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
        // console.log('userId', userId)
        // console.log('cartId', cartId)
        // console.log('items', items)

        try {
            const userCartItems = cartId && await strapi.db.query('api::cart-item.cart-item').findMany({
                where: {
                    cart: cartId,
                }
            });


            const userCartItemsMap = userCartItems?.reduce((acc, item) => {
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

            // console.log('resultsArray', resultsArray)
            return results;
        }
        catch (error) {
            // console.error('Error in batch stock validation:', error)
            throw error
        }
    },

    // ... other methods



    async reserveStock({ items, validationResults, userId }) {
        const reservationDuration = 15 * 60 * 1000; // 15 minutes
        const reservationExpiresAt = new Date(Date.now() + reservationDuration);

        const createdReservation = await strapi.entityService.create('api::stock-reservation.stock-reservation', {
            data: {
                user: userId,
                expiresAt: reservationExpiresAt,
                status: 'active',
            },
        });
        console.log('createdReservation', createdReservation)


        const reservationItems = await Promise.all(items.map(async (item) => {
            const validation = validationResults.success.find(result => result.localCartItemId === item.localCartItemId);
            // console.log('validation', validation)

            const quantityToReserve = validation.status === 'reduced' ? validation.newQuantity : item.quantity;
            // console.log('quantityToReserve', quantityToReserve)
            // console.log('userId: ', userId)
            // console.log('cartId: ', cartId)

            // const createdReservation = await this.reserveStock({
            //     productId: item.productId,
            //     sizeId: item.size.id,
            //     quantity: quantityToReserve,
            //     userId,
            //     cartId,
            //     reservationDuration,
            // });

            // return {
            //     message: validation.status === 'reduced' ? 'Limited Stock' : 'Stock Reserved',
            //     status: validation.status,
            //     localCartItemId: item.localCartItemId,
            //     newQuantity: quantityToReserve,
            //     availableStock: validation.availableStock,
            //     productTitle: validation.productTitle,
            // };
        }));

        console.log('reservationItems', reservationItems)

        this.setReservationExpiry(createdReservation.id, reservationDuration);


        // Set the dynamic expiration for the entire createdReservation

        return createdReservation;
    },

    async releaseStock(reservationId) {
        // Logic to release reserved stock
        const reservation = await strapi.entityService.findOne('api::stock-reservation.stock-reservation', reservationId);
        console.log('reservation')
        if (!reservation) return;

        const stock = await strapi.entityService.findOne('api::stock.stock', reservation.stock.id);

        await strapi.entityService.update('api::stock.stock', stock.id, {
            data: {
                reserved: stock.reserved - reservation.quantity,
            },
        });

        // Optionally, delete the reservation
        await strapi.entityService.delete('api::stock-reservation.stock-reservation', reservationId);
    },

    setReservationExpiry(reservationId, reservationDuration) {
        setTimeout(async () => {
            const reservation = await strapi.entityService.findOne('api::stock-reservation.stock-reservation', reservationId);

            if (reservation && new Date() > new Date(reservation.expiresAt)) {
                await this.releaseStock(reservationId);
            }
        }, reservationDuration);
    },

    async validateAndReserveStock({ items, userId, cartId }) {
        try {

            // Step 1: Validate Stock
            const validationResults = await this.batchValidateStock({ items: items });
            console.log('validationResults', validationResults)
            // if (validationResults.outOfStock.length > 0) {
            //     return {
            //         success: false,
            //         errors: validationResults.outOfStock,
            //     };
            // }

            // Step 3: Reserve Stock
            let reservation
            if (validationResults.success.length > 0) {
                reservation = await this.reserveStock({items, validationResults, userId})
            }

            // console.log('reservation', reservation);

            return validationResults;
        }
        catch (error) {
            throw error
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
