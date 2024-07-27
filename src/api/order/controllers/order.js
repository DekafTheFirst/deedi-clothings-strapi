
// @ts-ignore
const stripe = require("stripe")(process.env.STRIPE_KEY);
/**
 * order controller
 */

const axios = require('axios');


const { createCoreController } = require('@strapi/strapi').factories;

// @ts-ignore
module.exports = createCoreController("api::order.order", ({ strapi }) => ({
    // 
    async create(ctx) {
        const { items, shippingInfo, billingInfo } = ctx.request.body;
        console.log("shippingInfo", shippingInfo)
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
                success_url: `${process.env.CLIENT_URL}?success=true`,
                cancel_url: `${process.env.CLIENT_URL}/checkout-page`,
                line_items: lineItems,
                customer_email: shippingInfo.email,               
                payment_method_types: ['card'],
            });

            await strapi.service('api::order.order').create({
                data: {
                    items,
                    stripeId: session.id,
                    shippingInfo,
                    billingInfo,
                },
            });

            return { stripeSession: session };
        } catch (err) {
            console.log(err)
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
                        country_alpha2: 'US',
                        city: 'New York',
                        company_name: null,
                        contact_email: 'info@onetradectr.com',
                        contact_name: 'John Doe',
                        contact_phone: null,
                        line_1: '285 Fulton St',
                        postal_code: '10007',
                        state: 'NY'
                    },

                    origin_address: {
                        city: 'Baltimore',
                        company_name: null,
                        contact_email: 'info@innerharbor.com',
                        contact_name: 'Jane Smith',
                        contact_phone: null,
                        country_alpha2: 'US',
                        line_1: '401 Light St',
                        postal_code: '21202',
                        state: 'MD'
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


                    // parcels: [
                    //     {
                    //       box: null,
                    //       items: [
                    //         {
                    //           dimensions: {height: 3, length: 1, width: 2},
                    //           quantity: 2,
                    //           actual_weight: 10,
                    //           category: 'fashion',
                    //           declared_currency: 'USD',
                    //           declared_customs_value: 20,
                    //           description: 'item',
                    //           origin_country_alpha2: 'HK',
                    //           sku: 'sku'
                    //         }
                    //       ],
                    //       total_actual_weight: 1
                    //     }
                    //   ],



                    // destination_address: {
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
                    // parcels: [
                    //     {
                    //         box: null,
                    //         items: [
                    //             {
                    //                 actual_weight: 10,
                    //                 category: 'fashion',
                    //                 declared_currency: 'USD',
                    //                 declared_customs_value: 20,
                    //                 description: 'item',
                    //                 dimensions: { height: 3, length: 1, width: 2 },
                    //                 origin_country_alpha2: 'HK',
                    //                 quantity: 2,
                    //                 sku: 'sku'
                    //             }
                    //         ],
                    //         total_actual_weight: 1
                    //     }
                    // ]
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
        const sig = ctx.request.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;

        try {
            event = stripe.webhooks.constructEvent(ctx.request.body, sig, webhookSecret);
        } catch (err) {
            console.log(`Webhook error: ${err.message}`);
            ctx.response.status = 400;
            return { error: 'Webhook error: ' + err.message };
        }

        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                // Find the corresponding order in your database
                const order = await strapi.service('api::order.order').findOne({ stripeId: session.id });

                if (order) {
                    // Update order status to "paid"
                    await strapi.service('api::order.order').update({ id: order.id }, {
                        data: { status: 'paid' }
                    });
                }

                break;

            // Handle other event types if needed
            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        ctx.send({ received: true });
    },

    async handleStripeWebhook(ctx) {
        const sig = ctx.request.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;

        try {
            event = stripe.webhooks.constructEvent(ctx.request.body, sig, webhookSecret);
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
                const order = await strapi.service('api::order.order').findOne({ stripeId: session.id });

                if (order) {
                    // Update order status to "paid"
                    await strapi.service('api::order.order').update({ id: order.id }, {
                        data: { status: 'paid' }
                    });
                }
                break;

            // Handle other event types if needed
            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        ctx.send({ received: true });
    }
}));

