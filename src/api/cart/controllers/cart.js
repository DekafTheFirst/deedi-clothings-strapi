
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

  async mergeCartItems(ctx) {
    try {
      const { cartId } = ctx.params;
      const { items } = ctx.request.body;
      console.log('local items', items)

      // console.log('cartId', cartId)
      // console.log('items', items);

      // Fetch the current cart
      const cart = await strapi.entityService.findOne('api::cart.cart', cartId, {
        populate: ['items', 'items.product'],
      });

      console.log('cart', cart.items)

      const createItemPromises = [];


      // Merge items
      const updatedItems = cart.items.map(item => {
        const localItem = items.find(local => local.productId === item.product.id && local.size === item.size);
        if (localItem) {
          return {
            id: item.id,
            quantity: item.quantity + localItem.quantity,
            product: item.product.id,
            size: item.size,
            localCartItemId: item.localCartItemId,
            //Be careful with this line
          };
        }
        return {
          id: item.id,
          size: item.size,
          product: item.product.id,
          localCartItemId: item.localCartItemId,
          quantity: item.quantity,
        };
      });

      console.log('updatedItemsBeforeMap', updatedItems)



      for (const localItem of items) {
        if (!updatedItems.find(item => item.product === localItem.productId && item.size === localItem.size)) {
          // If item is not found in updatedItems, create it in Strapi
          createItemPromises.push(
            strapi.entityService.create('api::cart-item.cart-item', {
              data: {
                product: localItem.productId, // Ensure this matches the relationship key in Strapi
                size: localItem.size,
                quantity: localItem.quantity,
                localCartItemId: localItem.localCartItemId,
                cart: cartId,
                publishedAt: new Date()// Link the cart item to the cart
              },
            })
          );
        }
      }

      // Await all create item promises
      const createdItems = await Promise.all(createItemPromises);
      if (createdItems) {
        console.log('createdItems', createdItems)
        createdItems.forEach(newItem => {
          updatedItems.push({
            id: newItem.id,
            quantity: newItem.quantity,
            size: newItem.size,
            localCartItemId: newItem.localCartItemId
          });
        });
      }
      // Add newly created items to updatedItems



      console.log('updatedItems', updatedItems)


      // Update the cart with merged items
      const updatedCart = await strapi.entityService.update('api::cart.cart', cartId, {
        data: {
          items: updatedItems.map(item => ({
            id: item.id,
            quantity: item.quantity,
            size: item.size,
            product: item.product
          })),
          publishedAt: new Date(),
        },
        populate: { items: true },
      });

      console.log('updatedCart', updatedCart)



      ctx.send(updatedCart);
    } catch (error) {
      console.log(error)
      ctx.throw(500, error.message);
    }
  },

  // async update(ctx) {
  //   const { id } = ctx.params;
  //   const { items } = ctx.request.body;
  //   console.log("id", id)
  //   try {
  //     // Update the cart with new items
  //     const updatedCart = await strapi.services.cart.update({ id }, { items });
  //     console.log('updatedCart', updatedCart)
  //     // Respond with updated cart
  //     return ctx.send(updatedCart);
  //   } catch (error) {
  //     ctx.throw(500, error.message);
  //   }
  // },

  async update(ctx) {
    try {
      const { id } = ctx.params; // Cart ID from the URL
      const { items } = ctx.request.body; // Updated items from the request body
      console.log('items', items)

      // console.log('id', id)
      if (!id || !Array.isArray(items)) {
        return ctx.badRequest('Invalid input');
      }

      // Fetch the current cart with its items
      const currentCart = await strapi.entityService.findOne('api::cart.cart', id, {
        populate: ['items', 'items.product'],
      });
      console.log('currentCart', currentCart)


      if (!currentCart) {
        return ctx.notFound('Cart not found');
      }

    

      // Prepare the data for updating items
      const updatePromises = items.map(async (localItem) => {
        const existingItemInCart = currentCart.items.find((cartItem) => cartItem.product.id == localItem.productId && cartItem.size === localItem.size)
        if (existingItemInCart) {
          console.log('match');
          // Update existing localItem
          return strapi.entityService.update('api::cart-item.cart-item', existingItemInCart.id, {
            data: {
              quantity: existingItemInCart.quantity + localItem.quantity,
              size: localItem.size,
              product: localItem.productId,
            },
          });
        } else {
          // Create new item if does not exist
          const newItem = await strapi.entityService.create('api::cart-item.cart-item', {
            data: {
              quantity: localItem.quantity,
              size: localItem.size,
              product: localItem.productId,
            },
          });
          // Attach the new item to the cart
          await strapi.entityService.update('api::cart.cart', id, {
            data: {
              items: [...currentCart.items.map(item => item.id), newItem.id],
            },
          });
        }
      });

      // Execute all update/create operations
      await Promise.all(updatePromises);

      // Fetch and return the updated cart
      const updatedCart = await strapi.entityService.findOne('api::cart.cart', id, {
        populate: { items: true },
      });

      console.log('updatedCart', updatedCart)


      return ctx.send(updatedCart);
    } catch (error) {
      console.error('Error updating cart:', error);
      return ctx.internalServerError('Error updating cart');
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

    if (!cartId || !quantity) {
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
