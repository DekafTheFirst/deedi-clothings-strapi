
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
        const { items, shippingInfo, billingInfo, totalAmount } = ctx.request.body;
        console.log('billingInfo', billingInfo);
        console.log('shippingInfo', shippingInfo);


        const user = ctx.state.user;
        const userId = user?.id;
        console.log('userId', userId);

        const checkoutSessionIdCookie = ctx.cookies.get('checkout_session_id') || null;
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

            // console.log('productMap', productMap)


            const totalAmount = items.reduce((total, item) => {
                const product = productMap.get(item.productId);
                if (product) {
                    const itemTotal = product.price * item.quantity; // Assuming product has a `price` field and item has a `quantity`
                    return total + itemTotal;
                }
                return total;
            }, 0);

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
                    amount: totalAmount,
                    automatic_payment_methods: { enabled: true },
                    metadata: {
                        checkoutSessionId: checkoutSession.id,
                        orderId: foundOrder.id
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
                    orderId
                }
            });

            const updatedCheckoutSession = await strapi.entityService.update("api::checkout.checkout", checkoutSession.id, {
                data: { stripePaymentIntentId: paymentIntent.id },
            })

            const updatedOrder = await strapi.entityService.update("api::order.order", orderId, {
                data: { stripePaymentIntentId: paymentIntent.id },
            })

            console.log('paymentIntent created successfully', paymentIntent)

            // console.log('createdOrder', createdOrder.id)


            // Send publishable key and PaymentIntent details to client
            ctx.send({
                clientSecret: paymentIntent.client_secret,
            });

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

        // console.log('items', items)

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
                        city: 'San Francisco',
                        company_name: null,
                        contact_email: 'support@webservices.com',
                        contact_name: 'Jane Smith',
                        contact_phone: '987-654-3210',
                        country_alpha2: 'US',
                        line_1: '5678 Market Street',
                        line_2: 'Apt 200',
                        postal_code: '94103',
                        state: 'CA'
                    },

                    // destination_address: {
                    //     country_alpha2: 'HK',
                    //     city: 'Hong Kong',
                    //     company_name: null,
                    //     contact_email: 'asd@asd.com',
                    //     contact_name: 'Foo Bar',
                    //     contact_phone: null,
                    //     line_1: 'Kennedy Town',
                    //     line_2: 'Block 3',
                    //     postal_code: '0000',
                    //     state: 'Yuen Long'
                    // },

                    // origin_address: {
                    //     city: 'Hong Kong',
                    //     company_name: null,
                    //     contact_email: 'asd@asd.com',
                    //     contact_name: 'Foo Bar',
                    //     contact_phone: null,
                    //     country_alpha2: 'HK',
                    //     line_1: 'Kennedy Town',
                    //     line_2: 'Block 3',
                    //     postal_code: '0000',
                    //     state: 'Yuen Long'
                    // },
                    origin_address: {
                        city: 'New York',
                        company_name: 'Tech Solutions Inc.',
                        contact_email: 'contact@techsolutions.com',
                        contact_name: 'John Doe',
                        contact_phone: '123-456-7890',
                        country_alpha2: 'US',
                        line_1: '1234 Broadway',
                        line_2: 'Suite 100',
                        postal_code: '10001',
                        state: 'NY'
                    },


                    incoterms: 'DDU',
                    insurance: { is_insured: false },
                    parcels: [
                        {
                            items: items.map(item => ({
                                quantity: item.quantity,
                                weight: item.weight,
                                category: 'fashion',
                                actual_weight: 2,
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

            console.log(response.data)
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



        const paymentIntent = event.data.object;
        // console.log('paymentIntent meta data', paymentIntent.metadata);
        const paymentIntentMetaData = paymentIntent?.metadata

        let updatedOrder;

        switch (event.type) {
            // case 'product.deleted':
            //     const deletedProduct = event.data.object;
            //     await strapi.service('api::product.product').delete({ stripeProductId: deletedProduct.id });
            //     break;

            case 'payment_intent.succeeded':


                updatedOrder = await strapi.entityService.update('api::order.order', paymentIntentMetaData?.orderId, {
                    data: {
                        status: 'paid',
                    },
                })

                // console.log('updatedOrder', updatedOrder)

                if (!updatedOrder) {
                    console.error('Order not found')
                    ctx.throw(404, 'Order not found')
                }




                console.log('payment success');

                console.log('paymentIntent', paymentIntent)

                // Update order status to "paid"
                // console.log('updatedOrder', updatedOrder)

                // try {
                //     const options = {
                //         method: 'POST',
                //         url: 'https://api.easyship.com/2023-01/shipments',
                //         headers: {
                //             accept: 'application/json',
                //             'content-type': 'application/json',
                //             authorization: `Bearer ${process.env.EASYSHIP_API_KEY}`
                //         },
                //         data: {
                //             buyer_regulatory_identifiers: { ein: '12-3456789', vat_number: 'EU1234567890' },
                //             courier_selection: {
                //                 allow_courier_fallback: false,
                //                 apply_shipping_rules: true,
                //                 selected_courier_id: updatedOrder.selectedCourierId,
                //             },

                //             destination_address: {
                //                 city: 'Hong Kong',
                //                 company_name: 'Test Plc.',
                //                 contact_email: 'asd@asd.com',
                //                 contact_name: 'Foo Bar',
                //                 contact_phone: '+852-3008-5678',
                //                 country_alpha2: 'HK',
                //                 line_1: 'Kennedy Town',
                //                 line_2: 'Block 3',
                //                 postal_code: '0000',
                //                 state: 'Yuen Long'
                //             },

                //             origin_address: {
                //                 city: 'Hong Kong',
                //                 company_name: 'Test Plc.',
                //                 contact_email: 'asd@asd.com',
                //                 contact_name: 'Foo Bar',
                //                 contact_phone: '+852-3008-5678',
                //                 country_alpha2: 'HK',
                //                 line_1: 'Kennedy Town',
                //                 line_2: 'Block 3',
                //                 postal_code: '0000',
                //                 state: 'Yuen Long'
                //             },

                //             incoterms: 'DDU',
                //             insurance: { is_insured: false },

                //             // order_data: {
                //             //     buyer_selected_courier_name: order.selectedCourier.name,
                //             //     order_created_at: new Date(order.createdAt).toISOString(),
                //             //     platform_name: 'your_platform_name'
                //             // },

                //             regulatory_identifiers: { eori: 'DE12345678912345', ioss: 'IM1234567890', vat_number: 'EU1234567890' },
                //             shipping_settings: {
                //                 additional_services: { qr_code: 'none' },
                //                 buy_label: false,
                //                 printing_options: { commercial_invoice: 'A4', format: 'url', label: '4x6', packing_slip: '4x6' },
                //                 units: { dimensions: 'in', weight: 'lb' }
                //             },
                //             metadata: { orderId: updatedOrder?.id },
                //             parcels: [
                //                 {
                //                     items: updatedOrder.items.map(item => ({
                //                         quantity: item.quantity,
                //                         weight: item.weight,
                //                         category: 'fashion',
                //                         actual_weight: 10,
                //                         declared_currency: "USD",
                //                         declared_customs_value: 20,
                //                         dimensions: {
                //                             length: 1,
                //                             width: 2,
                //                             height: 3,
                //                         },
                //                         description: item.description,
                //                     })),
                //                 },
                //             ],
                //         }
                //     };

                //     // Create Shipment
                //     const easyshipResponse = await axios.request(options);
                //     const shipment = easyshipResponse.data.shipment
                //     console.log('shipment', shipment)

                //     if (shipment) {
                //         await strapi.db.query('api::order.order').update({
                //             where: { id: updatedOrder.id },
                //             data: {
                //                 shipmentId: shipment.easyship_shipment_id,
                //                 trackingPageUrl: shipment.tracking_page_url,
                //                 shippingDocuments: shipment.shipping_documents,
                //                 shipmentStatus: shipment.shipment_state,
                //                 courierName: shipment.courier.name,
                //                 courierId: shipment.courier.id,
                //                 shippingCost: shipment.rates[0].total_charge,  // Convert cents to dollars
                //                 currency: shipment.currency,
                //                 maxDeliveryTime: shipment.rates[0].max_delivery_time,
                //                 minDeliveryTime: shipment.rates[0].min_delivery_time,
                //                 labelGeneratedAt: shipment.label_generated_at,
                //                 labelPaidAt: shipment.label_paid_at,
                //             }
                //         });
                //     }

                //     if (easyshipResponse.status !== 200) {
                //         // console.log(easyshipResponse)
                //         throw new Error(`Easyship API request failed with status ${easyshipResponse.status}: ${easyshipResponse.statusText}`);
                //     }
                //     // console.log('Easyship shipment created:', easyshipResponse.data);

                // } catch (error) {
                //     console.error('Easyship API error:', error.response?.data?.error || error.message);
                // }

                const updatedCheckoutSession = await strapi.entityService.update("api::checkout.checkout", paymentIntentMetaData?.checkoutSessionId, {
                    data: { status: 'completed' }
                });

                console.log('updatedCheckoutSession', updatedCheckoutSession.status)

                console.log('Checkout session completed successfully');
                break;

            // case 'checkout.session.expired':
            //     // console.log('session', session)
            //     try {
            //         if (paymentIntentMetaData) {
            //             console.log('stripe session expired')

            //             updatedOrder = await strapi.entityService.update('api::order.order', paymentIntentMetaData?.orderId, {
            //                 data: { status: 'checkout_session_expired' }
            //             })
            //             console.log('updatedOrder', updatedOrder?.id)

            //             const endedheckoutSession = await strapi.service("api::checkout.checkout").endCheckoutSession({ checkoutSessionId: paymentIntentMetaData.checkoutSessionId })
            //             console.log(endedheckoutSession?.message)

            //             const deltedCheckoutSession = await strapi.entityService.delete("api::checkout.checkout", paymentIntentMetaData?.checkoutSessionId);
            //             console.log('Checkout Session deleted successfully')
            //         }
            //         else {
            //             console.log('Tried to delete session from yesterday')
            //         }
            //     }
            //     catch (error) {
            //         console.error('Error in expired event:', error)
            //     }
            //     break


            // Handle other event types if needed
            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        ctx.send({ received: true });
    },

    async handleEasyshipWebhook(ctx) {
        console.log(ctx.request.body)
        try {
            const webhookData = ctx.request.body; // This contains the webhook payload

            // Extract relevant data from the webhook
            const { event_type, resource_id, metadata } = webhookData;


            let updatedOrder
            switch (event_type) {
                case 'shipment.cancelled': {
                    // Remember to update this line
                    const orderItem = await strapi.db.query("api::order.order").findOne({
                        where: {
                            shipmentId: resource_id
                        },
                    })

                    console.log('orderItem', orderItem)
                    if (orderItem.status === 'shipped') {
                        console.log('Order is already shipped');
                        return ctx.badRequest('Order has already been shipped, you can initiate refund once it has been delivered')
                    }
                    else if (orderItem.status === 'cancelled') {
                        console.log('Order has already been cancelled');
                        return ctx.badRequest('Order has already been canclled')
                    }
                    else if (orderItem.status === 'delivered') {
                        console.log('Order has already been delivered');
                        return ctx.badRequest('Order has already been delivered, initiate refund instead')
                    }
                    else {
                        updatedOrder = await strapi.db.query("api::order.order").update({
                            where: {
                                shipmentId: resource_id
                            },
                            data: {
                                shipmentStatus: 'cancelled'
                            }
                        })
                        if (updatedOrder) {
                            const refund = await stripe.refunds.create({
                                payment_intent: updatedOrder?.stripePaymentIntentId,
                            });
                        }
                    }
                }
            }

            ctx.send({ message: 'Order updated successfully based on webhook' });

            // Ensure it's the event we are expecting
            // if (event_type === "shipment.tracking.status.changed") {
            //     const { easyship_shipment_id, status, tracking_number, tracking_page_url } = tracking_status;

            //     // Update the corresponding order based on the easyship_shipment_id
            //     const updatedOrder = await strapi.db.query('api::order.order').update({
            //         where: { shipmentId: easyship_shipment_id },
            //         data: {
            //             shipmentStatus: status, // Update with the new status like 'Delivered', 'In Transit', etc.
            //             trackingNumber: tracking_number,
            //             trackingPageUrl: tracking_page_url,
            //         },
            //     });

            //     // Check if the order was found and updated
            //     if (!updatedOrder) {
            //         ctx.throw(404, `Order not found for Easyship Shipment ID: ${easyship_shipment_id}`);
            //     }
            //     ctx.status = 200
            //     // Respond with success message
            //     ctx.send({ message: 'Order updated successfully based on webhook' });
            // } else {
            //     ctx.throw(400, 'Invalid event type');
            // }
        } catch (error) {
            console.error('Error handling Easyship webhook:', error);
            ctx.throw(500, 'Failed to process webhook');
        }
    },
}));

