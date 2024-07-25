const stripe = require('stripe')(process.env.STRIPE_KEY);
const axios = require('axios');

module.exports = {
  '0 0 * * *': async () => {  // This cron expression runs the job at midnight every day
    try {
      // Fetch products from Strapi
      const { data: products } = await axios.get(`${process.env.STRAPI_URL}/products`);

      // Sync products with Stripe
      for (const product of products) {
        let stripeProduct;
        // Check if the product already exists in Stripe
        if (product.stripeProductId) {
          stripeProduct = await stripe.products.retrieve(product.stripeProductId);
        } else {
          stripeProduct = await stripe.products.create({
            name: product.name,
            description: product.description,
            // Other product details
          });

          // Update the product in Strapi with the new Stripe product ID
          await axios.put(`${process.env.STRAPI_URL}/products/${product.id}`, {
            stripeProductId: stripeProduct.id,
          });
        }

        // Create or update the price in Stripe
        const stripePrice = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: Math.round(product.price * 100),
          currency: 'usd',
          // Other price details
        });

        // Update the product in Strapi with the new Stripe price ID
        await axios.put(`${process.env.STRAPI_URL}/products/${product.id}`, {
          stripePriceId: stripePrice.id,
        });
      }

      console.log('Products synced with Stripe successfully.');
    } catch (error) {
      console.error('Failed to sync products with Stripe:', error);
    }
  },
};
