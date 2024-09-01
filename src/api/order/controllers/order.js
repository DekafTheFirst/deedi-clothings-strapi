
// @ts-ignore
const stripe = require("stripe")(process.env.STRIPE_KEY);
/**
 * order controller
 */

const axios = require('axios');


const { createCoreController } = require('@strapi/strapi').factories;



// @ts-ignore
module.exports = createCoreController("api::order.order", ({ strapi }) => ({
    async initializeCheckout(ctx) {
        try {
            const reservationId = ctx.cookies.get('reservation_id');
            const checkoutSessionId = ctx.cookies.get('checkout_session_id');
            console.log('checkoutSessionId', checkoutSessionId)
            console.log('reservationId', reservationId)
            // Step 2: Validate and Reserve Stock
            if (!reservationId && !checkoutSessionId) {
                const user = ctx.state.user;
                const userId = user?.id; // Strapi auth middleware automatically attaches the user here
                const { items, cartId, customerEmail } = ctx.request.body;
                // console.log('user', user)

                const reservationDuration = 10 * 1000; 
                const reservationExpiresAt = new Date(Date.now() + reservationDuration);
                // Call your stock validation and reservation service


                const validationResults = await strapi.service('api::stock.stock').batchValidateStock({ items: items, cartId });
                // console.log('validationResults', validationResults)

                const reservableItems = [...validationResults.success, ...validationResults.reduced]
                const reservation = await strapi.service('api::stock.stock').reserveStocks({ reservationItems: reservableItems, userId, expiresAt: reservationExpiresAt })
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

                ctx.cookies.set('reservation_id', reservation.id, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict', // Less restrictive, may help with cross-site issues
                    expires: reservationExpiresAt,
                });


                ctx.send({ message: 'Checkout session initialized successfully', validationResults });

                setTimeout(async () => {
                    // console.log('reservation', reservation);
                    if (reservation && new Date() > new Date(reservation.expiresAt)) {
                        await strapi.service('api::stock.stock').deleteReservation({ reservationId: reservation?.id, checkoutSessionId: reservation?.checkoutSessionId, userId });
                    }
                }, reservationDuration);
            }
            else {
                ctx.send({ message: 'Checkeout session restored successfully', validationResults: null, sessionAlreadyExists: true });
            }




        } catch (error) {
            console.error('Checkout initialization controller error:\n', error)
            return ctx.internalServerError('An error occurred during checkout initialization.');
        }
    },

    async endCheckoutSession(ctx) {
        // Logic to release reserved stock
        try {
            const user = ctx.state.user;
            const userId = user?.id;

            const reservationId = ctx.cookies.get('reservation_id');
            const checkoutSessionId = ctx.cookies.get('checkout_session_id');

            if (!reservationId) {
                return ctx.badRequest('Missing reservation ID.');
            }

            if (!checkoutSessionId) {
                return ctx.badRequest('Missing checkout session ID.');
            }

            console.log('reservationId', reservationId);
            console.log('checkoutSessionId', checkoutSessionId);
            await strapi.service('api::stock.stock').deleteReservation({ reservationId, checkoutSessionId, userId });

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

    async create(ctx) {
        const { items, shippingInfo, billingInfo, totalAmount } = ctx.request.body;
        // console.log("items", items)
        console.log("billingInfo", billingInfo)


        try {
            const lineItems = await Promise.all(
                items.map(async (item) => {
                    const product = await strapi.service('api::product.product').findOne(item.productId);
                    // console.log(product)
                    return {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: product.title,
                            },
                            unit_amount: Math.round(product.price * 100),
                        },
                        quantity: item.quantity,
                    };
                })
            );

            const session = await stripe.checkout.sessions.create({
                mode: 'payment',
                success_url: `${process.env.CLIENT_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.CLIENT_URL}/checkout`,
                line_items: lineItems,
                customer_email: billingInfo?.email,
                payment_method_types: ['card'],
            });

            const createdOrder = await strapi.service('api::order.order').create({
                data: {
                    items,
                    stripeId: session.id,
                    shippingInfo,
                    billingInfo,
                    // courierId: selectedCourierId,
                    totalAmount
                },
            });

            return createdOrder;
        } catch (err) {
            console.log(err)
            ctx.response.status = 500;
            return err;
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





    async getCouriers(ctx) {
        const { address, items } = ctx.request.body;
        const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;
        // console.log(EASYSHIP_API_KEY);

        // console.log(address)

        try {
            const options = {
                method: 'POST',
                url: 'https://api.easyship.com/2023-01/rates',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    authorization: `Bearer ${EASYSHIP_API_KEY}`
                },
                data: {
                    courier_selection: { apply_shipping_rules: true, show_courier_logo_url: true },

                    // destination_address: {
                    //     country_alpha2: address.country,
                    //     city: address.city,
                    //     line_1: address.addressLine1,
                    //     postal_code: address.postalCode,
                    //     state: address.state
                    // },

                    destination_address: {
                        country_alpha2: 'HK',
                        city: 'Hong Kong',
                        company_name: null,
                        contact_email: 'asd@asd.com',
                        contact_name: 'Foo Bar',
                        contact_phone: null,
                        line_1: 'Kennedy Town',
                        line_2: 'Block 3',
                        postal_code: '0000',
                        state: 'Yuen Long'
                    },

                    origin_address: {
                        city: 'Hong Kong',
                        company_name: null,
                        contact_email: 'asd@asd.com',
                        contact_name: 'Foo Bar',
                        contact_phone: null,
                        country_alpha2: 'HK',
                        line_1: 'Kennedy Town',
                        line_2: 'Block 3',
                        postal_code: '0000',
                        state: 'Yuen Long'
                    },

                    incoterms: 'DDU',
                    insurance: { is_insured: false },
                    parcels: [
                        {
                            items: items.map(item => ({
                                quantity: item.quantity,
                                weight: item.weight,
                                category: 'fashion',
                                actual_weight: 10,
                                declared_currency: "USD",
                                declared_customs_value: 20,
                                dimensions: {
                                    length: item.length,
                                    width: item.width,
                                    height: item.height,

                                },
                            })),
                        },
                    ],

                    shipping_settings: { units: { dimensions: 'in', weight: 'lb' } }



                },
            };

            const response = await axios.request(options);

            if (response.status !== 200) {
                throw new Error(`Easyship API request failed with status ${response.status}`);
            }

            // console.log(response.data)
            // console.log(options)
            ctx.send({
                status: response.status,
                data: response.data,
            });

            // console.log(address, items);
            // ctx.send(address);
        } catch (error) {
            console.error('Easyship API error:', error.response.data.error);

            if (error.response && error.response.data) {
                ctx.throw(error.response.status, 'Easyship API error', error.response.data.error);
            } else {
                ctx.throw(500, 'Failed to fetch couriers', error);
            }
        }
    },




    async handleStripeWebhook(ctx) {
        const sig = ctx?.request.headers['stripe-signature'];
        const endpointSecret = "whsec_8ae6fbe7f7642ac26851cdf79de27ce529aa0f40d1f78f4f31fc2746deac90cd";


        let event;

        try {
            const raw = ctx?.request.body?.[Symbol.for('unparsedBody')];

            // console.log("RAWBODY",raw)
            event = stripe.webhooks.constructEvent(raw, sig, endpointSecret);
        } catch (err) {
            console.log(`Webhook error: ${err.message}`);
            ctx.response.status = 400;
            return { error: 'Webhook error: ' + err.message };
        }

        switch (event.type) {
            // case 'product.deleted':
            //     const deletedProduct = event.data.object;
            //     await strapi.service('api::product.product').delete({ stripeProductId: deletedProduct.id });
            //     break;

            case 'checkout.session.completed':
                const session = event.data.object;
                // Find the corresponding order in your database
                const order = await strapi.db.query('api::order.order').findOne({
                    where: { stripeId: session.id },
                });

                // console.log('session.id', session.id)
                // console.log('order', order)

                if (order) {
                    // Update order status to "paid"
                    const updatedOrder = await strapi.db.query('api::order.order').update({
                        where: { id: order.id },
                        data: { status: 'paid' },
                    });

                    // console.log('updatedOrder', updatedOrder)

                    try {
                        const options = {
                            method: 'POST',
                            url: 'https://api.easyship.com/2023-01/shipments',
                            headers: {
                                accept: 'application/json',
                                'content-type': 'application/json',
                                authorization: `Bearer ${process.env.EASYSHIP_API_KEY}`
                            },
                            data: {
                                buyer_regulatory_identifiers: { ein: '12-3456789', vat_number: 'EU1234567890' },
                                courier_selection: {
                                    allow_courier_fallback: false,
                                    apply_shipping_rules: true,
                                    selected_courier_id: updatedOrder.selectedCourierId,
                                },

                                destination_address: {
                                    city: 'Hong Kong',
                                    company_name: 'Test Plc.',
                                    contact_email: 'asd@asd.com',
                                    contact_name: 'Foo Bar',
                                    contact_phone: '+852-3008-5678',
                                    country_alpha2: 'HK',
                                    line_1: 'Kennedy Town',
                                    line_2: 'Block 3',
                                    postal_code: '0000',
                                    state: 'Yuen Long'
                                },

                                origin_address: {
                                    city: 'Hong Kong',
                                    company_name: 'Test Plc.',
                                    contact_email: 'asd@asd.com',
                                    contact_name: 'Foo Bar',
                                    contact_phone: '+852-3008-5678',
                                    country_alpha2: 'HK',
                                    line_1: 'Kennedy Town',
                                    line_2: 'Block 3',
                                    postal_code: '0000',
                                    state: 'Yuen Long'
                                },

                                incoterms: 'DDU',
                                insurance: { is_insured: false },

                                // order_data: {
                                //     buyer_selected_courier_name: order.selectedCourier.name,
                                //     order_created_at: new Date(order.createdAt).toISOString(),
                                //     platform_name: 'your_platform_name'
                                // },

                                regulatory_identifiers: { eori: 'DE12345678912345', ioss: 'IM1234567890', vat_number: 'EU1234567890' },
                                shipping_settings: {
                                    additional_services: { qr_code: 'none' },
                                    buy_label: true,
                                    buy_label_synchronous: true,
                                    printing_options: { commercial_invoice: 'A4', format: 'url', label: '4x6', packing_slip: '4x6' },
                                    units: { dimensions: 'in', weight: 'lb' }
                                },
                                parcels: [
                                    {
                                        items: updatedOrder.items.map(item => ({
                                            quantity: item.quantity,
                                            weight: item.weight,
                                            category: 'fashion',
                                            actual_weight: 10,
                                            declared_currency: "USD",
                                            declared_customs_value: 20,
                                            dimensions: {
                                                length: 1,
                                                width: 2,
                                                height: 3,
                                            },
                                            description: item.desc,
                                        })),
                                    },
                                ],
                            }
                        };

                        // Create Shipment
                        const easyshipResponse = await axios.request(options);
                        const shipment = easyshipResponse.data.shipment
                        console.log(shipment)

                        if (shipment) {
                            await strapi.db.query('api::order.order').update({
                                where: { id: order.id },
                                data: {
                                    shipmentId: shipment.easyship_shipment_id,
                                    trackingPageUrl: shipment.tracking_page_url,
                                    trackingNumber: shipment.trackings[0].tracking_number,
                                    shippingDocuments: shipment.shipping_documents,
                                    shipmentStatus: shipment.shipment_state,
                                    courierName: shipment.courier.name,
                                    courierId: shipment.courier.id,
                                    shippingCost: shipment.rates[0].total_charge,  // Convert cents to dollars
                                    currency: shipment.currency,
                                    maxDeliveryTime: shipment.rates[0].max_delivery_time,
                                    minDeliveryTime: shipment.rates[0].min_delivery_time,
                                    labelGeneratedAt: shipment.label_generated_at,
                                    labelPaidAt: shipment.label_paid_at,
                                }
                            });
                        }

                        if (easyshipResponse.status !== 200) {
                            // console.log(easyshipResponse)
                            throw new Error(`Easyship API request failed with status ${easyshipResponse.status}`);
                        }

                        console.log('Easyship shipment created:', easyshipResponse.data);
                    } catch (error) {
                        console.error('Easyship API error:', error.response?.data?.error || error.message);
                    }


                }
                break;

            // Handle other event types if needed
            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        ctx.send({ received: true });
    }
}));

