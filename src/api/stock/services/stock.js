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
            let result

            const product = await strapi.query('api::product.product').findOne({
                where: { id: productId },
                populate: { images: true }
            });

            

            // console.log('product', product.images)
            if (!product) {
                return {
                    message: 'Product not found',
                    status: 'out-of-stock',
                    productId,
                    
                };
            };

            const { price, discountedPrice } = product
            const img = product?.images?.[0]?.formats?.thumbnail?.url || product?.images?.[0]?.url
            // console.log('img', img)

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
                    ...productDetails
                };
            }

            const productDetails = {
                localCartItemId,
                productTitle: product.title,
                productId,
                stockId: stock.id,
                size,
                img,
                price: price,
                discountedPrice: discountedPrice,
            }
            
            const availableStock = stock.stock;

            // Determine if we need to check against user cart items
            let cartItem;
            if (strapiCartItemId) {
                cartItem = userCartItemsMap
                    ? userCartItemsMap[strapiCartItemId]
                    : await strapi.query('api::cart-item.cart-item').findOne({ where: { id: strapiCartItemId, cart: cartId } });
            }

            // console.log('availableStock', availableStock)
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
                    ...productDetails,
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
                    quantity: currentQuantity,
                    reducedBy: currentQuantity - availableStock,
                    newQuantity: availableStock,
                    availableStock,
                    ...productDetails,
                };
            }

            return {
                message: 'Success',
                status: 'success',
                quantity: currentQuantity,
                availableStock,
                ...productDetails
            }


        } catch (error) {
            console.error(error)
            return {
                message: `Error validating stock: ${error.message}`,
                status: 'validation-error',
                localCartItemId,
                productTitle: 'Unknown Product',
                productId,
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
            // console.log('resultsArray', resultsArray)

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
    async reserveStocks({ reservationItems, userId, expiresAt }) {

        // console.log('reservationItems', reservationItems);
        // console.log('expiresAt', expiresAt);

        // console.log('userId', userId)
        const checkoutSessionId = generateSessionId(userId);

        // console.log('checkoutSessionId', checkoutSessionId)
        const reservation = await strapi.entityService.create('api::stock-reservation.stock-reservation', {
            data: {
                user: userId,
                expiresAt,
                status: 'active',
                publishedAt: new Date(),
                checkoutSessionId,
            },
        });

        // console.log('reservation', reservation)

        const stockUpdates = reservationItems.map(item => ({
            id: item.stockId, // Assuming your stock ID field is 'id'
            quantity: item.quantity
        }));

        // const reservationItemPromises = await Promise.all(reservationItems.map(async (validatedItem) => {
        //     const { status, stockId, availableStock, quantity, newQuantity, localCartItemId, productTitle } = validatedItem;
        //     // console.log('validatedItem', validatedItem)
        //     const quantityToReserve = status === 'reduced' ? newQuantity : quantity;

        //     // console.log({ status, quantityToReserve })

        //     const updatedStock = await strapi.entityService.update("api::stock.stock", stockId, {
        //         data: {
        //             stock: availableStock - quantityToReserve
        //         }
        //     })

        //     // console.log('updatedStock', updatedStock.stock)

        //     const reservationItem = await strapi.entityService.create("api::stock-reservation-item.stock-reservation-item", {
        //         data: {
        //             stock: stockId,
        //             quantity,
        //             stock_reservation: reservation.id,
        //             publishedAt: new Date()
        //         },
        //     })

        //     // console.log('reservationItem', reservationItem)

        //     return {
        //         status: status,
        //         message: status === 'reduced' ? 'Limited Stock' : 'Stock Reserved',
        //         localCartItemId: localCartItemId,
        //         newQuantity: quantityToReserve,
        //         availableStock: availableStock,
        //         productTitle: productTitle,
        //     };
        // }));


        // this.setReservationExpiry(reservation.id, reservationDuration);

        // const updatedReservation = await strapi.entityService.findOne("api::stock-reservation.stock-reservation", reservation?.id);
        // console.log('updatedReservation', updatedReservation)
        // Set the dynamic expiration for the entire reservation

        return reservation;
    },



    async deleteReservation({ reservationId, checkoutSessionId, userId }) {
        if (!reservationId) {
            throw new Error('Reservation ID is required.');
        }

        try {
            console.log('reservationId', reservationId);

            // Fetch the reservation and related stock items
            const reservation = await strapi.db.query('api::stock-reservation.stock-reservation').findOne({
                where: {
                    id: reservationId,
                    checkoutSessionId
                },
                populate: {
                    stock_reservation_items: {
                        populate: ['stock']
                    }
                }
            });

            if (!reservation) {
                throw new Error(`Reservation with ID ${reservationId} not found.`);
            }

            const reservedItems = reservation.stock_reservation_items;
            const reservedItemIds = reservedItems.map(item => item.id);
            console.log('reservedItemIds', reservedItemIds);

            // Prepare stock updates
            const stockUpdates = reservedItems.map(reservedItem => ({
                id: reservedItem.stock.id,
                reserved: reservedItem.quantity,
                availableStock: reservedItem.stock.stock
            }));

            console.log('stockUpdates', stockUpdates);

            // Update stocks
            const updatedStocks = await Promise.all(
                stockUpdates.map(stock =>
                    strapi.entityService.update('api::stock.stock', stock.id, {
                        data: {
                            stock: stock.availableStock + stock.reserved,
                        }
                    })
                )
            );

            console.log('updatedStocks', updatedStocks);

            // Delete reservation items
            const { count: noOfReservationItemsDeleted } = await strapi.db.query('api::stock-reservation-item.stock-reservation-item').deleteMany({
                where: {
                    id: {
                        $in: reservedItemIds,
                    },
                },
            });

            console.log('noOfReservationItemsDeleted', noOfReservationItemsDeleted);

            // Delete reservation
            const deletedReservation = await strapi.entityService.delete('api::stock-reservation.stock-reservation', reservationId);
            console.log('deletedReservation', deletedReservation);

        } catch (error) {
            // Log the error and rethrow to be handled by the caller
            console.error('Error deleting reservation:', error.message);
            throw new Error(`Failed to delete reservation: ${error.message}`);
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
