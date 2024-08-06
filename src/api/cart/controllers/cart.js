const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::cart.cart', ({ strapi }) => ({
  async create(ctx) {
    const userId = ctx.request.body.userId
    if (!userId) {
      return ctx.badRequest('User ID is required');
    }
    // Check if the user already has a cart
    let cart = await strapi.db.query('api::cart.cart').findOne({
      where: { user: userId }, // Properly query the relational user field
    });

    if (!cart) {
      // Create a new cart if it doesn't exist
      cart = await strapi.db.query('api::cart.cart').create({
        data: {
          user: userId,
          items: [],
          publishedAt: new Date(), // Set the publishedAt field to publish the cart
          // Initialize with an empty array or as per your requirements
        },
      });
    }

    // Return the cart
    ctx.body = cart;
  },
  async update(ctx) {
    const { id } = ctx.params;
    const { items } = ctx.request.body;
    console.log("id", id)
    try {
      // Update the cart with new items
      const updatedCart = await strapi.services.cart.update({ id }, { items });
      console.log('updatedCart', updatedCart)
      // Respond with updated cart
      return ctx.send(updatedCart);
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  async createCartItem(ctx) {
    const { cartId } = ctx.params;
    const { id, productId, quantity, size, localCartItemId } = ctx.request.body;

    if (!cartId || !productId || !quantity || !size) {
      return ctx.badRequest('Missing required fields');
    }

    try {
      // Find the cart
      const cart = await strapi.db.query('api::cart.cart').findOne({
        where: { id: cartId },
        populate: { items: true },
      });

      if (!cart) {
        return ctx.notFound('Cart not found');
      }

      // Check if item already exists in the cart
      const existingItem = cart.items.find((item) => item.productId === productId && item.size === size);

      if (existingItem) {
        // Update existing item
        await strapi.db.query('api::cart-item.cart-item').updateMany({
          where: { id: existingItem.id },
          data: { quantity: quantity },
        });
        return ctx.send({ message: 'Item updated successfully' });
      } else {
        // Add new item
        const createdCartItem = await strapi.db.query('api::cart-item.cart-item').create({
          data: { cart: cartId, product: productId, quantity, size, publishedAt: new Date(), localCartItemId },
        });

        console.log('createdCartItem', createdCartItem)

        return ctx.send({ message: 'Item added successfully', data: createdCartItem });
      }
    } catch (error) {
      strapi.log.error(error);
      return ctx.internalServerError('Failed to add or update item');
    }
  },

  async updateCartItem(ctx) {
    const { cartId, cartItemId } = ctx.params;
    const { productId, quantity, size, localCartItemId } = ctx.request.body;

    if (!cartId || !quantity ) {
      return ctx.badRequest('Missing required fields');
    }

    try {
      // Find the cart
      const cart = await strapi.db.query('api::cart.cart').findOne({
        where: { id: cartId },
        populate: { items: true },
      });

      if (!cart) {
        return ctx.notFound('Cart not found');
      }

      // Check if item already exists in the cart

      // Update existing item
      const updatedCartItem = await strapi.db.query('api::cart-item.cart-item').update({
        where: { id: cartItemId },
        data: { quantity: quantity },
      });

      // console.log('updatedCartItem', updatedCartItem)
      

      return ctx.send({ message: 'Item updated successfully', data: updatedCartItem });

    } catch (error) {
      strapi.log.error(error);
      return ctx.internalServerError('Failed to update item');
    }
  },

  async removeItemFromCart(ctx) {
    try {
      const { cartId, itemId } = ctx.params; // Assuming cartId and itemId are passed in the URL
      console.log(cartId, itemId)
      // Find the cart
      const cart = await strapi.db.query('api::cart.cart').findOne({ where: { id: cartId } });
      if (!cart) {
        return ctx.badRequest('Cart not found');
      }

      // Find the cart item
      const cartItem = await strapi.db.query('api::cart-item.cart-item').findOne({
        where: { id: itemId, cart: cartId }
      });

      console.log(cartItem)


      if (!cartItem) {
        return ctx.badRequest('Item not found in cart');
      }

      // Remove the item
      await strapi.db.query('api::cart-item.cart-item').delete({
        where: { id: itemId }
      });

      // Return a success message
      return ctx.send({ message: 'Item removed successfully' });
    } catch (error) {
      ctx.throw(500, `Failed to remove item from cart: ${error.message}`);
    }

  },
}));
