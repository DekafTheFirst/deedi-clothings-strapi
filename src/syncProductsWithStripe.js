require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_KEY);
const axios = require('axios');

async function syncProductsWithStripe() {
    const STRAPI_URL = process.env.STRAPI_URL;
    const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;

    try {
        // Fetch products from Strapi
        const { data } = await axios.get(`${STRAPI_URL}/api/products`, {
            headers: {
                Authorization: `Bearer ${STRAPI_API_TOKEN}`,
            },
        });
        const products = data.data;

        // Fetch products from Stripe
        const stripeProducts = await stripe.products.list();
        const stripeProductMap = new Map(stripeProducts.data.map(product => [product.id, product]));

        for (const product of products) {
            const productAttributes = product.attributes;
            let stripeProduct;

            // Check if the product already exists in Stripe
            if (productAttributes.stripeProductId) {
                stripeProduct = stripeProductMap.get(productAttributes.stripeProductId);
                if (!stripeProduct) {
                    // If the product ID exists in Strapi but not in Stripe, remove it from Strapi
                    await axios.delete(`${STRAPI_URL}/api/products/${product.id}`, {
                        headers: {
                            Authorization: `Bearer ${STRAPI_API_TOKEN}`,
                        },
                    });
                }
                // Update product in Stripe if necessary
                await stripe.products.update(productAttributes.stripeProductId, {
                    name: productAttributes.title,
                });
            } else {
                // Create product in Stripe
                stripeProduct = await stripe.products.create({
                    name: productAttributes.title,
                });

                // Update the product in Strapi with the new Stripe product ID
                await axios.put(
                    `${STRAPI_URL}/api/products/${product.id}`,
                    { data: { stripeProductId: stripeProduct.id } },
                    {
                        headers: {
                            Authorization: `Bearer ${STRAPI_API_TOKEN}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
            }

            // Create or update the price in Stripe
            // Update the price object if necessary
            const stripePrices = await stripe.prices.list({ product: stripeProduct.id, limit: 100 });
            const stripeCurrentPrice = stripePrices?.data?.length ? stripePrices.data[0] : null;
            const productPrice = productAttributes.price * 100;



            if (stripeCurrentPrice) {
                console.log("stripe current price:", stripeCurrentPrice);
                console.log("product price:", productPrice);

                if (stripeCurrentPrice.unit_amount !== productPrice) {
                    console.log('should update')
                    await stripe.prices.create({
                        product: stripeProduct.id,
                        unit_amount: productPrice,
                        currency: 'usd',
                    });
                }
            }
            else {
                console.log('should create')
                console.log("product attr", productPrice);
                await stripe.prices.create({
                    product: stripeProduct.id,
                    unit_amount: productPrice,
                    currency: 'usd',
                });
            }
            // Remove the product from the map after processing
            stripeProductMap.delete(stripeProduct.id);
        }

        // Delete any remaining products in Stripe that are not in Strapi
        for (const [stripeProductId] of stripeProductMap) {
            // await stripe.products.del(stripeProductId);
            

            const updatedStripeProduct = await stripe.products.update(stripeProductId, {
                active: false // Adjust based on your Strapi model
                // Update other attributes as needed
            });

            // const updatedPrice = await stripe.prices.update(
            //     updatedStripeProduct.stripePriceId,
            //     {
            //         // lookup_key: 'MY_LOOKUP_KEY',
            //         active: false,
            //     }
            // );
        }

        console.log('Products synced with Stripe successfully.');
    } catch (error) {
        if (error.isAxiosError) {
            // Extract relevant error details
            const errorDetails = {
                message: error.message,
                url: error.config?.url,
                status: error.response?.status,
                data: error.response?.data,
                headers: error.response?.headers,
                code: error.code,
            };
            // Log only the relevant error details
            console.error('Failed to sync products with Stripe:');
            console.error('Error Details:', errorDetails);
        } else {
            // Handle non-Axios errors
            console.error('Unexpected Error:', error.message);
        }
    }
}

syncProductsWithStripe();
