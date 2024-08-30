'use strict';


/**
 * stock service
 */

const { errors } = require('@strapi/utils');
const { ApplicationError } = errors;
const { createCoreService } = require('@strapi/strapi').factories;
const crypto = require('crypto');

function generateSessionId(userId = null) {
    // console.log('userId', userId)

    const timestamp = Date.now();
    const randomComponent = crypto.randomBytes(16).toString('hex');
    if (userId) {
        // Include userId in the session ID if it's provided
        return `sess_user_${userId}_${timestamp}_${randomComponent}`;
    } else {
        // Otherwise, generate a standard session ID
        return `sess_${timestamp}_${randomComponent}`;
    }
}

module.exports = createCoreService('api::stock.stock', ({ strapi }) => ({
    // Assuming this is located in `api/stock/services/stock.js` or similar
    async validateCartItem({ item, userCartItemsMap = null, requestedQuantity, cartId }) {
        const { productId, size, quantity: currentQuantity, localCartItemId, strapiCartItemId } = item;
        // console.log("ProductId: ", productId, ',requested: ', requestedQuantity)
        // console.log('cartId', cartId);
        try {
            // Fetch product and stock details
            const product = await strapi.query('api::product.product').findOne({ where: { id: productId } });
            if (!product) {
                return {
                    message: 'Product not found',
                    status: 'out-of-stock',
                    localCartItemId,
                    productTitle: 'Unknown Product',
                    productId
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
                    productTitle: 'Unknown Product',
                    productId
                };
            }
            const availableStock = stock.stock;

            // Determine if we need to check against user cart items
            let cartItem;
            if (strapiCartItemId) {
                cartItem = userCartItemsMap
                    ? userCartItemsMap[strapiCartItemId]
                    : await strapi.query('api::cart-item.cart-item').findOne({ where: { id: strapiCartItemId, cart: cartId } });
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
                    productTitle: stock.product.title,
                    productId,
                    stockId: stock.id
                };
            }

            if (currentQuantity > availableStock) {
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
                    quantity: currentQuantity,
                    reducedBy: currentQuantity - availableStock,
                    newQuantity: availableStock,
                    stockId: stock.id,
                    availableStock,
                    productTitle: stock.product.title,
                    productId

                };
            }

            return {
                message: 'Success',
                status: 'success',
                availableStock,
                localCartItemId,
                productTitle: stock.product.title,
                productId,
                quantity: currentQuantity,
                stockId: stock.id,

            };

        } catch (error) {
            return {
                message: `Error validating stock: ${error.message}`,
                status: 'validation-error',
                localCartItemId,
                productTitle: 'Unknown Product',
                productId
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
                cartId,
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

    async validateAndReserveStock({ items, userId, cartId, expiresAt }) {
        try {

            // Step 1: Validate Stock
            const validationResults = await this.batchValidateStock({ items: items, cartId });
            // console.log('validationResults', validationResults)
            // if (validationResults.outOfStock.length > 0) {
            //     return {
            //         success: false,
            //         errors: validationResults.outOfStock,
            //     };
            // }

            // Step 3: Reserve Stock

            const reservableItems = [...validationResults.success, ...validationResults.reduced]
            // console.log('reservableItems', reservableItems)
            const reservation = await this.reserveStocks({ validatedStockItems: reservableItems, userId, expiresAt })

            // console.log('reservation', reservation);

            return { validationResults: validationResults, reservationId: reservation.id, checkoutSessionId: reservation.checkoutSessionId };
        }
        catch (error) {
            throw error
        }
    },

    async reserveStocks({ validatedStockItems, userId, expiresAt }) {

        // console.log('validatedStockItems', validatedStockItems);
        // console.log('expiresAt', expiresAt);

        // console.log('userId', userId)
        const checkoutSessionId = generateSessionId(userId);

        console.log('checkoutSessionId', checkoutSessionId)
        const createdReservation = await strapi.entityService.create('api::stock-reservation.stock-reservation', {
            data: {
                user: userId,
                expiresAt,
                status: 'active',
                publishedAt: new Date(),
                checkoutSessionId,
            },
        });

        // console.log('createdReservation', createdReservation)

        const stockUpdates = validatedStockItems.map(item => ({
            id: item.stockId, // Assuming your stock ID field is 'id'
            quantity: item.quantity
        }));

        const reservationItems = await Promise.all(validatedStockItems.map(async (validatedItem) => {
            const { status, stockId, availableStock, quantity, newQuantity, localCartItemId, productTitle } = validatedItem;
            // console.log('validatedItem', validatedItem)
            const quantityToReserve = status === 'reduced' ? newQuantity : quantity;

            // console.log({ status, quantityToReserve })

            // const updatedStock = await strapi.entityService.update("api::stock.stock", stockId, {
            //     data: {
            //         stock: availableStock - quantityToReserve
            //     }
            // })

            // console.log('updatedStock', updatedStock.stock)

            const reservationItem = await strapi.entityService.create("api::stock-reservation-item.stock-reservation-item", {
                data: {
                    stock: stockId,
                    quantity,
                    stock_reservation: createdReservation.id,
                    publishedAt: new Date()
                },
            })

            // console.log('reservationItem', reservationItem)

            return {
                status: status,
                message: status === 'reduced' ? 'Limited Stock' : 'Stock Reserved',
                localCartItemId: localCartItemId,
                newQuantity: quantityToReserve,
                availableStock: availableStock,
                productTitle: productTitle,
            };
        }));


        // this.setReservationExpiry(createdReservation.id, reservationDuration);

        // const updatedReservation = await strapi.entityService.findOne("api::stock-reservation.stock-reservation", createdReservation?.id);
        // console.log('updatedReservation', updatedReservation)
        // Set the dynamic expiration for the entire createdReservation

        return createdReservation;
    },

    async releaseStock(reservationId) {
        // Logic to release reserved stock
        // console.log('reservation')
        const reservation = await strapi.entityService.findOne('api::stock-reservation.stock-reservation', reservationId, { populate: ['stock'] });
        if (!reservation) return;
        console.log('reservation', reservation)
        // This should loop items and update accordingly
        const stock = await strapi.entityService.findOne('api::stock.stock', reservation.stock.id);
        const availableSock = stock.stock;
        console.log('availableSock', stock.stock);

        const updated = await strapi.entityService.update('api::stock.stock', stock.id, {
            data: {
                reserved: stock.reserved - reservation.quantity,
            },
        });
        console.log('updatedStock', updated.stock)


        // Optionally, delete the reservation
        await strapi.entityService.delete('api::stock-reservation.stock-reservation', reservationId);
    },

    setReservationExpiry(reservationId, reservationDuration) {
        setTimeout(async () => {
            const reservation = await strapi.entityService.findOne('api::stock-reservation.stock-reservation', reservationId);
            // console.log('reservation', reservation);
            if (reservation && new Date() > new Date(reservation.expiresAt)) {
                await this.releaseStock(reservationId);
            }
        }, reservationDuration);
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
