require('dotenv').config({ path: './.env' });
const stripe = require('stripe')(process.env.STRIPE_KEY);
const axios = require('axios');



async function syncProductsWithStripe() {
    const STRAPI_URL = process.env.STRAPI_URL;
    const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;
    const STRIPE_KEY = process.env.STRIPE_KEY;
    console.log(STRAPI_API_TOKEN)


    // console.log('STRAPI_URL:', process.env.STRAPI_URL);
    // console.log('STRIPE_API_KEY:', process.env.STRIPE_KEY);
    try {
        // Fetch products from Strapi
        const { data } = await axios.get(`${STRAPI_URL}/api/products`);
        const products = data.data
        // Sync products with Stripe
        for (const product of products) {
            let stripeProduct;
            const productAttributes = product.attributes
            // Check if the product already exists in Stripe
            if (productAttributes.stripeId) {
                stripeProduct = await stripe.products.retrieve(productAttributes.stripeId);
            } else {
                stripeProduct = await stripe.products.create({
                    name: productAttributes.title,
                    // description: productAttributes.desc,
                    // Other productAttributes details
                });
                // console.log(stripeProduct);

                // Update the productAttributes in Strapi with the new Stripe productAttributes ID
                await axios.put(
                    `${process.env.STRAPI_URL}/api/products/${product.id}`, // URL
                    { data: { stripeId: stripeProduct.id } }, // Data payload
                    { // Configuration
                        headers: {
                            Authorization: `Bearer ${STRAPI_API_TOKEN}`,
                            'Content-Type': 'application/json' // Ensure the correct content type is set
                        }
                    }
                );

            }

            // Create or update the price in Stripe
            await stripe.prices.create({
                product: stripeProduct.id,
                unit_amount: Math.round(productAttributes.price * 100),
                currency: 'usd',
            });
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
