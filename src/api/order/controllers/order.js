
// @ts-ignore
const stripe = require("stripe")(process.env.STRIPE_KEY);
/**
 * order controller
 */

const axios = require('axios');


const { createCoreController } = require('@strapi/strapi').factories;



// @ts-ignore
module.exports = createCoreController("api::order.order", ({ strapi }) => ({
    async create(ctx) {
        const { items, shippingInfo, billingInfo, totalAmount, customerEmail } = ctx.request.body;


        const user = ctx.state.user;
        const userId = user?.id;
        console.log('userId', userId);

        const checkoutSessionId = ctx.cookies.get('checkout_session_id') || null;
        console.log('checkoutSessionId', checkoutSessionId);






        // console.log('checkoutSessionId', checkoutSessionId);

        // console.log("billingInfo", billingInfo)


        try {

            const productIds = items.map(item => item.productId);

            // Fetch all products in a single query
            const products = await strapi.entityService.findMany('api::product.product', {
                filters: { id: { $in: productIds } },
            });

            // Create a map of products by their ID for quick lookup
            const productMap = new Map(products.map(product => [product.id, product]));

            console.log('productMap', productMap)
            const lineItems = items.map(item => {
                const product = productMap.get(item.productId);

                if (!product) {
                    throw new Error(`Product with ID ${item.productId} not found`);
                }

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
            });

            const currentTime = Date.now()
            const stripeSessionExpiresAt = new Date(currentTime + 30 * 60 * 1000);


            const createdOrder = await strapi.service('api::order.order').create({
                data: {
                    items: items.map((item) => {
                        const { title, quantity, img, size } = item
                        return ({
                            title,
                            quantity,
                            img,
                            size: size.size,
                            price: productMap.get(item.productId).price
                        })
                    }),
                    checkoutSessionId,
                    shippingInfo,
                    billingInfo,
                    user: userId,
                    customerEmail,
                    currency: 'USD',
                    // courierId: selectedCourierId,
                    totalAmount,
                    publishedAt: new Date()
                },
                populate: ['user']
            });



            console.log('createdOrder', createdOrder.id)

            const session = await stripe.checkout.sessions.create({
                mode: 'payment',
                line_items: lineItems,
                customer_email: billingInfo?.email,
                payment_method_types: ['card'],
                cancel_url: `${process.env.CLIENT_URL}/cart`,
                success_url: `${process.env.CLIENT_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
                expires_at: stripeSessionExpiresAt,
                metadata: {
                    checkoutSessionId,
                    orderId: createdOrder.id
                }
            });

            // setTimeout(async () => {
            //     try {
            //         const currentStateOfSession = await stripe.checkout.sessions.retrieve(session.id)
            //         if (currentStateOfSession.status === "open") {
            //             await stripe.checkout.sessions.expire(session.id)
            //             console.log('stripe session expired,, from timeout')
            //         }
            //     }
            //     catch (error) {
            //         console.log('Error in timeout', error)
            //     }
            // }, 10 * 1000)

            if (!checkoutSessionId) {
                console.log('no session')
                ctx.badRequest('Your session has expired, please try again.')
            }

            const updatedCheckoutSession = await strapi.db.query("api::checkout.checkout").update({
                where: {
                    checkoutSessionId,
                    user: userId,
                },
                data: {
                    stripeId: session.id,
                }
            });
            // console.log('updatedCheckoutSession', updatedCheckoutSession)


            console.warn('Stripe session created successfully')




            return { sessionId: session.id };
        } catch (err) {
            console.error(err.message || err)
            ctx.response.status = 500;
            return err;
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

        const session = event.data.object;
        console.log('session meta data', session.metadata);
        const sessionMetadata = session?.metadata

        let updatedOrder;

        switch (event.type) {
            // case 'product.deleted':
            //     const deletedProduct = event.data.object;
            //     await strapi.service('api::product.product').delete({ stripeProductId: deletedProduct.id });
            //     break;

            case 'checkout.session.completed':


                updatedOrder = await strapi.entityService.update('api::order.order', sessionMetadata?.orderId, {
                    data: {
                        status: 'paid',
                        stripeSessionId: session.id,
                    }
                })

                console.log('updatedOrder', updatedOrder.id)

                if (!updatedOrder) {
                    console.error('Order not found')
                    ctx.throw(404, 'Order not found')
                }




                console.log('payment success');

                // console.log('session.id', session.id)
                // console.log('order', order)

                // Update order status to "paid"
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
                    // console.log(shipment)

                    if (shipment) {
                        await strapi.db.query('api::order.order').update({
                            where: { id: updatedOrder.id },
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
                    // console.log('Easyship shipment created:', easyshipResponse.data);

                } catch (error) {
                    console.error('Easyship API error:', error.response?.data?.error || error.message);
                }

                const deltedCheckoutSession = await strapi.entityService.delete("api::checkout.checkout", sessionMetadata?.checkoutSessionId);
                console.log('Checkout Session deleted successfully');
                break;

            case 'checkout.session.expired':
                console.log('session', session)
                try {
                    if (sessionMetadata) {
                        console.log('stripe session expired')

                        updatedOrder = await strapi.entityService.update('api::order.order', sessionMetadata?.orderId, {
                            data: { status: 'checkout_session_expired' }
                        })
                        console.log('updatedOrder', updatedOrder?.id)

                        const endedheckoutSession = await strapi.service("api::checkout.checkout").endCheckoutSession({ checkoutSessionId: sessionMetadata.checkoutSessionId })
                        console.log(endedheckoutSession?.message)

                        const deltedCheckoutSession = await strapi.entityService.delete("api::checkout.checkout", sessionMetadata?.checkoutSessionId);
                        console.log('Checkout Session deleted successfully')
                    }
                    else {
                        console.log('Tried to delete session from yesterday')
                    }
                }
                catch (error) {
                    console.error('Error in expired event:', error)
                }
                break


            // Handle other event types if needed
            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        ctx.send({ received: true });
    }
}));

