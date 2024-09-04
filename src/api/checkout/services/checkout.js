'use strict';

/**
 * checkout service
 */

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


module.exports = createCoreService('api::checkout.checkout', ({ strapi }) => ({
    async reserveStocks({ reservationItems, userId, expiresAt }) {

        // console.log('reservationItems', reservationItems);
        // console.log('expiresAt', expiresAt);

        // console.log('userId', userId)
        const checkoutSessionId = generateSessionId(userId);

        // console.log('checkoutSessionId', checkoutSessionId)
        const checkoutSession = await strapi.entityService.create('api::checkout.checkout', {
            data: {
                user: userId,
                expiresAt,
                status: 'active',
                publishedAt: new Date(),
                checkoutSessionId,
            },
        });

        // console.log('checkoutSession', checkoutSession)

        const stockUpdates = reservationItems.map(item => ({
            id: item.stockId, // Assuming your stock ID field is 'id'
            quantity: item.quantity
        }));

        const reservationItemPromises = await Promise.all(reservationItems.map(async (validatedItem) => {
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
                    checkout: checkoutSession.id,
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


        // this.setReservationExpiry(checkoutSession.id, reservationDuration);

        // const updatedReservation = await strapi.entityService.findOne("api::checkout.checkout", checkoutSession?.id);
        // console.log('updatedReservation', updatedReservation)
        // Set the dynamic expiration for the entire checkoutSession

        return checkoutSession;
    },



    async endCheckoutSession({ checkoutSessionId, userId }) {

        try {
            // console.log('checkoutSessionId', checkoutSessionId);
            // Fetch the reservation and related stock items
            const checkoutSession = await strapi.db.query('api::checkout.checkout').findOne({
                where: {
                    checkoutSessionId
                },
                populate: {
                    stock_reservation_items: {
                        populate: ['stock']
                    }
                }
            });


            if (checkoutSession) {
                if (checkoutSession.status != 'payment_pending') {

                    const reservedItems = checkoutSession.stock_reservation_items;
                    const reservedItemIds = reservedItems.map(item => item.id);
                    // console.log('reservedItemIds', reservedItemIds);

                    // Prepare stock updates
                    const stockUpdates = reservedItems.map(reservedItem => ({
                        id: reservedItem.stock.id,
                        reserved: reservedItem.quantity,
                        availableStock: reservedItem.stock.stock
                    }));

                    // console.log('stockUpdates', stockUpdates);

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

                    // console.log('updatedStocks', updatedStocks);

                    // Delete checkoutSession items
                    const { count: noOfReservationItemsDeleted } = await strapi.db.query('api::stock-reservation-item.stock-reservation-item').deleteMany({
                        where: {
                            id: {
                                $in: reservedItemIds,
                            },
                        },
                    });

                    // console.log('noOfReservationItemsDeleted', noOfReservationItemsDeleted);

                    // Delete checkoutSession
                    const expiredCheckoutSession = await strapi.db.query('api::checkout.checkout').update({ where: { checkoutSessionId }, data: { expired: true } });
                    return { message: 'Session Cleared Successfully' }
                }
                else {
                    return { message: 'Payment has already been initiated, will wait another 15mins before clearing session' }
                }
            }
            else {
                console.log('Checkout session already cleared')
                return { message: 'Checkout session not found' }
            }



        } catch (error) {
            // Log the error and rethrow to be handled by the caller
            throw error;
        }
    },
}));
