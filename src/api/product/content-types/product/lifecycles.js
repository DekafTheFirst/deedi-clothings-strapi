// ./src/api/product/content-types/product/lifecycles.js

const stripe = require('stripe')(process.env.STRIPE_KEY);

module.exports = {
  async afterCreate(event) {
    const { result } = event;

    try {
      // Create a product in Stripe
      const stripeProduct = await stripe.products.create({
        name: result.title, // Adjust based on your Strapi model
        // Add other attributes as needed
      });
      console.log('new stripe product created')

      // Create price
      const stripePrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: result.price * 100,
        currency: 'usd',
      });

      // Update Strapi product with Stripe ID
      const updatedProduct = await strapi.service('api::product.product').update(result.id, {
        data: { stripeProductId: stripeProduct.id, stripePriceId: stripePrice.id },
      });

      console.log(updatedProduct)



      strapi.log.info(`Created product ${result.id} in Stripe and updated Strapi.`);
    } catch (error) {
      strapi.log.error(`Failed to create product in Stripe: ${error.message}`);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    console.log("result", result)

    try {
      if (result.stripeProductId) {
        // Update the product in Stripe
        const updatedStripeProduct = await stripe.products.update(result.stripeProductId, {
          name: result.title, // Adjust based on your Strapi model
          // Update other attributes as needed
        });
        console.log('updatedStripeProduct:', updatedStripeProduct)
      }

      await stripe.prices.create({
        product: updatedStripeProduct.id,
        unit_amount: result.price * 100,
        currency: 'usd',
      });

      console.log(`updatedStripePrice for prodct ${result.id}`)


      strapi.log.info(`Updated product ${result.id} in Stripe.`);

    } catch (error) {
      strapi.log.error(`Failed to update product in Stripe: ${error.message}`);
    }
  },

  async afterDelete(event) {
    const { result } = event;
    console.log(result)

    try {
      if (result.stripeProductId) {
        // Delete the prices for the product first 
        console.log(result.stripeProductId)
        // Delete the product from Stripe

        const updatedPrice = await stripe.prices.update(
          result.stripePriceId,
          {
            // lookup_key: 'MY_LOOKUP_KEY',
            active: false,
          }
        );

        const updatedStripeProduct = await stripe.products.update(result.stripeProductId, {
          active: false // Adjust based on your Strapi model
          // Update other attributes as needed
        });



        strapi.log.info(`Made Stripe product ${result.id} inactive.`);
      }
    } catch (error) {
      strapi.log.error(`Failed to delete product ${result.id} in Stripe: ${error.message}`);
    }
  },
};
