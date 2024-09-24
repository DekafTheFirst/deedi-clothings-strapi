'use strict';

/**
 * checkout controller
 */

const stripe = require("stripe")(process.env.STRIPE_KEY);

const { createCoreController } = require('@strapi/strapi').factories;




module.exports = createCoreController('api::checkout.checkout', ({ strapi }) => ({
    async initializeCheckout(ctx) {
        try {
            console.log(ctx.request.body)
            const checkoutSessionIdCookie = ctx.cookies.get('checkout_session_id') || null;
            console.log(ctx.request.headers); // Log headers to check for X-Forwarded-Proto

            // Step 2: Validate and Reserve Stock
            if (checkoutSessionIdCookie) {
                const foundCheckoutSession = await strapi.db.query("api::checkout.checkout").findOne({
                    where: { checkoutSessionId: checkoutSessionIdCookie },
                })

                console.log('foundCheckoutSession', foundCheckoutSession)


                if (foundCheckoutSession) {
                    const currentTime = new Date();
                    const checkoutSessionExpiryDate = new Date(foundCheckoutSession.expiresAt)
                    if (foundCheckoutSession.status === "expired" || currentTime > checkoutSessionExpiryDate) {
                        ctx.cookies.set('checkout_session_id', '', {
                            expires: new Date(0)
                        });
                        return ({ message: 'Session has expired', status: 'expired' })
                    }

                    if (foundCheckoutSession.status === 'completed' || foundCheckoutSession.status !== "active") {
                        ctx.cookies.set('checkout_session_id', '', {
                            expires: new Date(0)
                        });
                        return ({ message: 'Session has already been completed', status: 'completed' })
                    }
                }

                console.log('Checkout session restored successfully',)
                ctx.send({ message: 'Checkout session re-initialized successfully', validationResults: null, status: 're-initialized' });
            }
            else {
                const user = ctx.state.user;
                const userId = user?.id; // Strapi auth middleware automatically attaches the user here
                const { items, cartId, customerEmail } = ctx.request.body;
                // console.log('user', user)

                const checkoutSessionDuration = 20 * 60 * 1000;
                const checkoutSessionExpiresAt = new Date(Date.now() + checkoutSessionDuration);
                // Call your stock validation and checkoutSession service


                const validationResults = await strapi.service('api::cart-item.cart-item').batchValidateCartItems({ items: items, cartId });
                // console.log('validationResults', validationResults)

                const reservableItems = [...validationResults.success, ...validationResults.reduced]
                // console.log('reservableItems', reservableItems)

                const checkoutSession = await strapi.service('api::checkout.checkout').reserveStocks({ reservationItems: reservableItems, userId, expiresAt: checkoutSessionExpiresAt })
                // console.log('checkoutSession', checkoutSession)





                const validItems = [...validationResults.success, ...validationResults.reduced]
                // console.log('validItems', validItems.map((item) => ({ title: item.productTitle, size: item.size, status: item.status })))

                // console.log('checkoutSessionExpiresAt', checkoutSessionExpiresAt)
                ctx.cookies.set('checkout_session_id', checkoutSession.checkoutSessionId, {
                    httpOnly: true, // Set to false to see it in Application tab
                    secure: process.env.NODE_ENV === 'production', // Ensure the cookie is only sent over HTTPS in production
                    sameSite: 'None', // Allows cross-site requests (important for frontend/backend communication)
                    expires: checkoutSessionExpiresAt,
                    // 15 minutes in milliseconds
                });

                console.log('Checkout session initialized successfully')
                ctx.send({ message: 'Checkout session initialized successfully', validationResults, checkoutSessionDuration, checkoutSessionExpiresAt, checkoutSessionAlreadyExists: false });

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

            console.log('checkoutSessionId', checkoutSessionId);

            if (checkoutSessionId) {
                await strapi.service('api::checkout.checkout').endCheckoutSession({ checkoutSessionId, userId });

                ctx.cookies.set('checkout_session_id', '', {
                    expires: new Date(0)
                });
                console.log('checkout session cookie cleared')
                ctx.send({ message: 'Checkout session cleared successfully' });
            }
            else {
                console.log('Checkout session has expired')
                ctx.send({ message: 'Checkout session cleared successfully' })
            }
        }
        catch (error) {
            console.error(error)
            // Handle any unexpected errors
            ctx.throw(500, 'Something went wrong');
        }
    },


    async createPaymentIntent(ctx) {
        const { items, shippingInfo, billingInfo, totalAmount, courierId } = ctx.request.body;
        console.log('items', items);
        console.log('shippingInfo', shippingInfo);
        console.log('courierId', courierId)

        const user = ctx.state.user;
        const userId = user?.id;
        console.log('userId', userId);

        const checkoutSessionIdCookie = ctx.cookies.get('checkout_session_id');
        console.log('checkoutSessionIdCookie', checkoutSessionIdCookie);

        if (!checkoutSessionIdCookie) {
            return ctx.gone('Checkout session has expired', {})
        }


        // console.log('checkoutSessionIdCookie', checkoutSessionIdCookie);

        // console.log("billingInfo", billingInfo)

        const checkoutSession = await strapi.db.query("api::checkout.checkout").findOne({
            where: { checkoutSessionId: checkoutSessionIdCookie },
            populate: { stock_reservation_items: true },
        })

        // console.log('checkoutSession', checkoutSession);



        if (checkoutSession && checkoutSession.stripePaymentIntentId) {
            const retrievedaymentIntent = await stripe.paymentIntents.retrieve(checkoutSession.stripePaymentIntentId);
            console.log('retrievedaymentIntent retrieved', retrievedaymentIntent)

            if (retrievedaymentIntent?.status === "succeeded") {
                // Conflict
                return ctx.conflict('This payment has already been processed. Please check your order history or contact support for assistance.', { error: 'This payment has already been processed. Please check your order history or contact support for assistance.' });
            }
            else {
                ctx.body = { message: 'Payment Intent Retrieved', sessionId: checkoutSession.stripeSessionId, clientSecret: retrievedaymentIntent?.client_secret }
            }
            return;
        }



        try {
            const productIds = items.map(item => item.productId);

            // Fetch all products in a single query
            const products = await strapi.entityService.findMany('api::product.product', {
                filters: { id: { $in: productIds } },
            });

            // Create a map of products by their ID for quick lookup
            const productMap = new Map(products.map(product => [product.id, product]));

            const lineItems = items.map((item) => {
                const product = productMap.get(item.productId);
                return ({ amount: Math.round(item.quantity * product.price  * 100), quantity: item.quantity, reference: item.localCartItemId, tax_code: product.stripeTaxCode })
            })
            console.log('lineItems', lineItems)

            const courierOption = checkoutSession.shippingRates.find((rate) => rate.courier_id  === courierId);
            console.log('courierOption', courierOption)
            const shippingCost = courierOption.total_charge;
            
            const taxCalculation = await strapi.service("api::checkout.checkout").calculateTax({ shippingInfo, lineItems, shippingCost: Math.round(shippingCost * 100) })
            console.log('taxCalculation', taxCalculation)
            
            const totalAmount = taxCalculation?.amount_total
            console.log('totalAmount', totalAmount)
            


            // const currentTime = Date.now()
            // const stripeSessionExpiresAt = new Date(currentTime + 30 * 60 * 1000);



            const foundOrder = await strapi.db.query('api::order.order').findOne({
                where: {
                    checkoutSessionId: checkoutSession?.checkoutSessionId
                }
            })
            console.log('foundOrder', foundOrder)

            let paymentIntent;
            let orderId;

            if (foundOrder && !foundOrder?.stripePaymentIntentId) {
                paymentIntent = await stripe.paymentIntents.create({
                    currency: "usd",
                    amount: taxCalculation,
                    automatic_payment_methods: { enabled: true },
                    metadata: {
                        checkoutSessionId: checkoutSession.id,
                        orderId: foundOrder.id,
                        taxCalculationId: taxCalculation?.id
                    }
                });
                orderId = foundOrder.id
            }
            else {
                const createdOrder = await strapi.service('api::order.order').create({
                    data: {
                        items: items.map((item) => {
                            const { title, quantity, img, size, productId } = item
                            return ({
                                title,
                                quantity,
                                img,
                                size: size.size,
                                price: productMap.get(item.productId).price,
                                description: productMap.get(item.productId).desc,
                                productId: productId
                            })
                        }),
                        checkoutSessionId: checkoutSessionIdCookie,
                        shippingAddress: shippingInfo,
                        // billingAddress: billingInfo,
                        user: userId,
                        customerEmail: shippingInfo?.email,
                        currency: 'USD',
                        // courierId: selectedCourierId,
                        totalAmount,
                        publishedAt: new Date()
                    },
                    populate: ['user']
                });
                orderId = createdOrder.id
            }



            paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: totalAmount,
                automatic_payment_methods: { enabled: true },
                metadata: {
                    checkoutSessionId: checkoutSession.id,
                    orderId,
                    taxCalculationId: taxCalculation?.id

                }
            });

            const updatedCheckoutSession = await strapi.entityService.update("api::checkout.checkout", checkoutSession.id, {
                data: { stripePaymentIntentId: paymentIntent.id },
            })

            const updatedOrder = await strapi.entityService.update("api::order.order", orderId, {
                data: { stripePaymentIntentId: paymentIntent.id },
            })

            // console.log('paymentIntent created successfully', paymentIntent)

            // console.log('createdOrder', createdOrder.id)


            // Send publishable key and PaymentIntent details to client
            ctx.send({
                clientSecret: paymentIntent.client_secret,
                taxCalculation
            });

        } catch (err) {
            console.error(err.message || err)
            ctx.response.status = 500;
            return err;
        }

    },

    async verifyCheckout(ctx) {
        const { token } = ctx.request.body;

        try {
            // Verify the token with Stripe
            const session = await stripe.checkout.sessions.retrieve(token);

            if (session.payment_status === 'processing') {
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
