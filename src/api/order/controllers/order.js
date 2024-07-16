('use strict');

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
        // @ts-ignore
        const { products } = ctx.request.body;
        console.log("products", products) 
         
        const lineItems = await Promise.all(
            products.map(async (product) => {
                const item = await strapi
                    .service("api::product.product")
                    .findOne(product.id);
                console.log('item', item)

                return {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: item.title,
                        },
                        unit_amount: Math.round(item.price * 100),
                    },
                    quantity: product.quantity,
                };
            })
        );

        try {
            console.log('lineItems', lineItems)
            const session = await stripe.checkout.sessions.create({
                mode: "payment",
                success_url: `${process.env.CLIENT_URL}?success=true`,
                cancel_url: `${process.env.CLIENT_URL}?success=false`,
                line_items: lineItems,
                shipping_address_collection: { allowed_countries: ["US", "CA"] },
                payment_method_types: ["card"],
            });

            await strapi
                .service("api::order.order")
                .create({
                    data: {
                        products,
                        stripeId: session.id,
                    }
                })

            return { stripeSession: session }
        } catch (err) {
            ctx.response.status = 500;
            return err;
        }
    },

    async getCouriers(ctx) {
        const context = ctx.request.body;
        const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;

        try {
            // const options = {
            //     method: 'POST',
            //     url: 'https://api.easyship.com/2023-01/rates',
            //     headers: {
            //         accept: 'application/json',
            //         'content-type': 'application/json',
            //         Authorization: `Bearer ${EASYSHIP_API_KEY}`,
            //     },
            //     data: {
            //         courier_selection: { apply_shipping_rules: true, show_courier_logo_url: false },
            //         destination_address: { country_alpha2: address.country },
            //         incoterms: 'DDU',
            //         insurance: { is_insured: false },
            //         parcels: [
            //             {
            //                 items: items.map(item => ({
            //                     quantity: item.quantity,
            //                     weight: item.weight,
            //                     dimensions: {
            //                         length: item.length,
            //                         width: item.width,
            //                         height: item.height,
            //                     },
            //                 })),
            //             },
            //         ],
            //         shipping_settings: { units: { dimensions: 'inches', weight: 'lb' } },
            //     },
            // };

            // const response = await axios.request(options);
            console.log(context.country)
            ctx.send(context.country);
        } catch (error) {
            console.error('Error fetching couriers', error);
            ctx.throw(500, 'Failed to fetch couriers', error);
        }
    },


}));

