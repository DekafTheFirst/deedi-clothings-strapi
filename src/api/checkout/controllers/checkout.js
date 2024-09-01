'use strict';

/**
 * checkout controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::checkout.checkout', ({ strapi }) => ({
    async initializeCheckout(ctx) {
        try {
            const checkoutSessionId = ctx.cookies.get('checkout_session_id');
            console.log('checkoutSessionId', checkoutSessionId)
            // Step 2: Validate and Reserve Stock
            if (!checkoutSessionId) {
                const user = ctx.state.user;
                const userId = user?.id; // Strapi auth middleware automatically attaches the user here
                const { items, cartId, customerEmail } = ctx.request.body;
                // console.log('user', user)

                const reservationDuration = 1 * 1000;
                const reservationExpiresAt = new Date(Date.now() + reservationDuration);
                // Call your stock validation and reservation service


                const validationResults = await strapi.service('api::cart-item.cart-item').batchValidateCartItems({ items: items, cartId });
                // console.log('validationResults', validationResults)

                const reservableItems = [...validationResults.success, ...validationResults.reduced]
                // console.log('reservableItems', reservableItems)

                const reservation = await strapi.service('api::checkout.checkout').reserveStocks({ reservationItems: reservableItems, userId, expiresAt: reservationExpiresAt })
                console.log('reservation', reservation)





                const validItems = [...validationResults.success, ...validationResults.reduced]
                console.log('validItems', validItems.map((item) => ({ title: item.productTitle, size: item.size, status: item.status })))

                // console.log('reservationExpiresAt', reservationExpiresAt)

                ctx.cookies.set('checkout_session_id', reservation.checkoutSessionId, {
                    httpOnly: true, // Set to false to see it in Application tab
                    secure: process.env.NODE_ENV === 'production', // Ensure the cookie is only sent over HTTPS in production
                    sameSite: 'strict', // Less restrictive, may help with cross-site issues
                    expires: reservationExpiresAt,
                    // 15 minutes in milliseconds
                });

                setTimeout(async () => {
                    // console.log('reservation', reservation);
                    try {
                        if (reservation && new Date() > new Date(reservation.expiresAt)) {
                            await strapi.service('api::checkout.checkout').deleteReservation({ checkoutSessionId: reservation.checkoutSessionId, userId });
                        }
                    } catch (timeoutError) {
                        console.error('Error clearing reservation in timeout:', timeoutError);
                    }
                }, reservationDuration);

                ctx.send({ message: 'Checkout session initialized successfully', validationResults });


            }
            else {
                ctx.send({ message: 'Checkeout session restored successfully', validationResults: null, sessionAlreadyExists: true });
            }




        } catch (error) {
            console.error('Checkout initialization controller error:\n', error)
            return ctx.throw(500, 'An error occurred during checkout initialization.');
        }
    },

    async endCheckoutSession(ctx) {
        // Logic to release reserved stock
        try {
            const user = ctx.state.user;
            const userId = user?.id;

            const checkoutSessionId = ctx.cookies.get('checkout_session_id');



            if (!checkoutSessionId) {
                return ctx.badRequest('Missing checkout session ID.');
            }

            console.log('checkoutSessionId', checkoutSessionId);
            await strapi.service('api::checkout.checkout').deleteReservation({ checkoutSessionId, userId });

            ctx.cookies.set('checkout_session_id', '', {
                expires: new Date(0)
            });

            ctx.send({ message: 'Checkout session cleared successfully' });
        }
        catch (error) {
            console.error(error)
            // Handle any unexpected errors
            ctx.throw(500, 'Something went wrong');
        }
    },

    async verifyCheckout(ctx) {
        const { token } = ctx.request.body;

        try {
            // Verify the token with Stripe
            const session = await stripe.checkout.sessions.retrieve(token);

            if (session.payment_status === 'paid') {
                // Handle successful payment
                ctx.send({ success: true, message: 'Payment verified' });
            } else {
                // Handle payment failure
                ctx.send({ success: false, message: 'Payment not verified' });
            }
        } catch (error) {
            ctx.send({ success: false, message: error.message });
        }
    },
    
}));
