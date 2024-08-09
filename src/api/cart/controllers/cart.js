
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
        populate: {
          items: {
            populate: {
              product: {
                populate: ['img'],
                fields: ['title', 'price', 'img']
              }
            }
          }
        },
      });
    }

    // Return the cart
    ctx.send({ message: 'Cart successfuly created', data: cart });
  },



  async update(ctx) {
    try {
      const { id } = ctx.params; // Cart ID from the URL
      const { items } = ctx.request.body; // Updated items from the request body
      // console.log('items', items.map(item=> ({id: item.productId, size: item.size, quantity: item.quantity })))
      console.log('item', items[0])

      // console.log('id', id)
      if (!id || !Array.isArray(items)) {
        return ctx.badRequest('Invalid input');
      }

      // Fetch the current cart with its items
      const currentCart = await strapi.entityService.findOne('api::cart.cart', id, {
        populate: ['items', 'items.product', 'items.product.stocks.size'],
      });

      console.log('currentCart', currentCart?.items?.map(item => ({ id: item.product.id, size: item.size, quantity: item.quantity })))


      if (!currentCart) {
        return ctx.notFound('Cart not found');
      }



      // Prepare the data for updating items
      const updatePromises = items.map(async (localItem) => {
        const existingItemInCart = currentCart.items.find((cartItem) => cartItem.product.id == localItem.productId && cartItem.size === localItem.size);


        const product = await strapi.db.query('api::product.product').findOne({
          where: { id: localItem.productId },
          populate: ['stocks', 'stocks.size'],
        });
  
        if (!product) {
          return ctx.notFound('Product not found');
        }

        console.log('product', product)
  
  
        // console.log('product', product)
  
        const productStock = new Map(
          product.stocks.map(stock => [stock.size.size, stock.stock])
        );

        console.log('productStock', productStock)
        

        if (existingItemInCart) {
          console.log('match');

          if (productStock.get(size) < quantity) {
            const availableStock = productStock.get(size);
  
            return ctx.send({
              message: 'Not enough stock available',
              availableStock: availableStock
            }, 400);
          }
          // Update existing localItem
          return await strapi.entityService.update('api::cart-item.cart-item', existingItemInCart.id, {
            data: {
              quantity: existingItemInCart.quantity + localItem.quantity,
              size: localItem.size,
              product: localItem.productId,
            },
          });
        } else {
          // Create new item if does not exist
          console.log('no match')

          if (productStock.get(size) < quantity) {
            const availableStock = productStock.get(size);
  
            return ctx.send({
              message: 'Not enough stock available',
              availableStock: availableStock
            }, 400);
          }
          
          const newItem = await strapi.entityService.create('api::cart-item.cart-item', {
            data: {
              quantity: localItem.quantity,
              size: localItem.size,
              product: localItem.productId,
              localCartItemId: localItem.localCartItemId,
              publishedAt: new Date(),
              price: localItem.price,
              cart: id
            },
            populate: ['product', 'product.img']
          });
        }
      });

      // Execute all update/create operations
      await Promise.all(updatePromises);

      // Fetch and return the updated cart
      const updatedCart = await strapi.entityService.findOne('api::cart.cart', id, {
        populate: {
          items: {
            populate: {
              product: {
                populate: {
                  img: true, // Populate the img field of the product
                },
                fields: ['title', 'price'], // Specify fields of the product
              },
            },
          },
        },
      });

      console.log('updatedCart', updatedCart.items.map(item => ({ id: item.product.id, size: item.size, quantity: item.quantity })))


      ctx.send({ message: 'Cart successfuly created', data: updatedCart });
    } catch (error) {
      console.error('Error updating cart:', error);
      return ctx.internalServerError('Error updating cart');
    }
  },


  async addItemToCart(ctx) {
    const { cartId } = ctx.params;
    const { productId, quantity, size, localCartItemId, price } = ctx.request.body;

    // console.log('body', ctx.request.body);

    if (!cartId || !productId || !quantity || !size || !price, !localCartItemId) {
      return ctx.badRequest('Missing required fields');
    }

    try {
      // Find the cart
      const cart = await strapi.db.query('api::cart.cart').findOne({
        where: { id: cartId },
        populate: {
          items: {
            populate: ['product']
          }
        },
      });

      // console.log('cart', cart.items)

      if (!cart) {
        return ctx.notFound('Cart not found');
      }

      const product = await strapi.db.query('api::product.product').findOne({
        where: { id: productId },
        populate: ['stocks', 'stocks.size'],
      });

      if (!product) {
        return ctx.notFound('Product not found');
      }


      // console.log('product', product)

      const productStock = new Map(
        product.stocks.map(stock => [stock.size.size, stock.stock])
      );
      console.log('productStock', productStock)



      // Check if item already exists in the cart
      const existingItem = cart.items.find((item) => item.product.id === productId && item.size === size);

      if (existingItem) {
        // Check stock first
        if (productStock.get(size) < quantity) {
          const availableStock = productStock.get(size);

          // Send error response with available stock included
          return ctx.send({
            message: 'Not enough stock available',
            availableStock: availableStock
          }, 400);
        }

        // Update existing item
        await strapi.db.query('api::cart-item.cart-item').update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + quantity },
        });
        return ctx.send({ message: 'Item updated successfully' });
      } else {

        // Check stock and maybe add new item
        if (productStock.get(size) < quantity) {
          const availableStock = productStock.get(size);

          return ctx.send({
            message: 'Not enough stock available',
            availableStock: availableStock
          }, 400);
        }

        const createdCartItem = await strapi.db.query('api::cart-item.cart-item').create({
          data: { cart: cartId, product: productId, quantity, size, localCartItemId, price, publishedAt: new Date(), localCartItemId },
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
      console.log(error);
      return ctx.internalServerError('Failed to update item');
    }
  },

  async removeItemFromCart(ctx) {
    try {
      const { cartId, itemId } = ctx.params; // Assuming cartId and itemId are passed in the URL
      // console.log(cartId, itemId)
      // Find the cart
      const cart = await strapi.db.query('api::cart.cart').findOne({ where: { id: cartId } });
      if (!cart) {
        return ctx.badRequest('Cart not found');
      }

      // Find the cart item
      const cartItem = await strapi.db.query('api::cart-item.cart-item').findOne({
        where: { id: itemId, cart: cartId }
      });

      // console.log(cartItem)


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
