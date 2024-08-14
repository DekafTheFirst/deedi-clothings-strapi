
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



  async fetchAndMergeCart(ctx) {
    try {
      const { userId } = ctx.params; // Cart ID from the URL
      const { items } = ctx.request.body; // Updated items from the request body
      console.log('items', items.map(item => ({ id: item.productId, size: item.size, quantity: item.quantity })))
      // console.log('localItem', items[0])

      // console.log('id', id)
      if (!userId) {
        return ctx.unauthorized('User is not authenticated');
      }

      // Step 2: Validate Input
      if (!Array.isArray(items)) {
        return ctx.badRequest('Invalid input');
      }

      // Fetch the current cart with its items
      let currentCart = await strapi.db.query('api::cart.cart').findOne({
        where: { user: userId }, // Properly query the relational user field
        populate: ['items', 'items.product', 'items.product.stocks.size'],
      });

      // console.log('currentCart', currentCart)

      const cartId = currentCart.id;

      console.log('currentCart', currentCart?.items?.map(item => ({ id: item.product.id, size: item.size, quantity: item.quantity })))


      if (!currentCart) {
        return ctx.notFound('Cart not found');
      }

      // Check if any items need to be reduced or removed from cart 
      const existingItemsStockCheck = await Promise.all(currentCart.items.map(async (existingItem) => {
        const product = await strapi.db.query('api::product.product').findOne({
          where: { id: existingItem.product.id },
          populate: ['stocks', 'stocks.size'],
        });

        if (!product) {
          return { status: 'failed', productId: localItem.productId, reason: 'Product Not Found' };
        }

        // console.log('product', product)


        // console.log('product', product)

        const productStock = new Map(
          product.stocks.map(stock => [stock.size.size, stock.stock])
        );

        console.log('productStock', productStock);

        const availableStock = productStock.get(existingItem.size);
        const totalQuantityInCart = existingItem ? existingItem.quantity : 0;

        if (availableStock <= 0) {
          await strapi.entityService.delete('api::cart-item.cart-item', existingItem.id);

          return {
            status: 'deleted',
            productId: existingItem.product.id,
            productTitle: existingItem.product.title,
            size: existingItem.size,
            reason: 'Out Of Stock',
          };
        }

        if (totalQuantityInCart > availableStock) {
          await strapi.entityService.update('api::cart-item.cart-item', existingItem.id, {
            data: {
              quantity: availableStock,
            }
          });

          return {
            status: 'reduced',
            productId: existingItem.product.id,
            productTitle: existingItem.product.title,
            size: existingItem.size,
            removed: totalQuantityInCart - availableStock,
            reason: 'Limited Stock'
          };
        }

        else {
          return {
            status: 'not-reduced'
          }
        }


      }))

      console.log('existingItemsStockCheck', existingItemsStockCheck)

      // Execute all update/create operations
      const results = await Promise.all(items.map(async (localItem) => {
        const existingItemInCart = currentCart.items.find((cartItem) => cartItem.product.id == localItem.productId && cartItem.size === localItem.size);
        console.log('existingItemInCart', existingItemInCart)

        const product = await strapi.db.query('api::product.product').findOne({
          where: { id: localItem.productId },
          populate: ['stocks', 'stocks.size'],
        });

        if (!product) {
          return ctx.notFound('Product not found');
        }

        // console.log('product', product)


        // console.log('product', product)

        const productStock = new Map(
          product.stocks.map(stock => [stock.size.size, stock.stock])
        );

        console.log('productStock', productStock);

        const availableStock = productStock.get(localItem.size);
        const totalQuantityInCart = existingItemInCart ? existingItemInCart.quantity : 0;


        const handleStockCheck = () => {
          switch (true) {
            case (availableStock <= 0):
              return { status: 'failed', productId: localItem.productId, reason: 'Out of stock' };


            case ((localItem.quantity + totalQuantityInCart) > availableStock):
              if (availableStock - totalQuantityInCart <= 0) {
                return { status: 'failed', productId: localItem.productId, reason: 'Max stock already in cart' };
              }
              return {
                status: 'partial',
                productId: localItem.productId,
                added: availableStock - totalQuantityInCart,
                reason: 'Limited stock'
              };

            default:
              return { status: 'success' };
          }
        };

        const stockCheckResult = handleStockCheck();
        console.log('stockCheckResult', stockCheckResult)

        if (stockCheckResult.status === 'failed') {
          return {
            ...stockCheckResult,
            size: localItem.size,
            productTitle: product.title
          };
        }

        if (stockCheckResult.status === 'partial') {
          await strapi.entityService.update('api::cart-item.cart-item', existingItemInCart ? existingItemInCart.id : undefined, {
            data: {
              quantity: stockCheckResult.added + totalQuantityInCart,
              size: localItem.size,
              product: localItem.productId,
            }
          });
          return {
            ...stockCheckResult,
            size: localItem.size,
            productTitle: product.title
          };
        }

        // if (stockCheckResult.status === 'reduced') {
        //   await strapi.entityService.update('api::cart-item.cart-item', existingItemInCart ? existingItemInCart.id : undefined, {
        //     data: {
        //       quantity: availableStock,
        //       size: localItem.size,
        //       product: localItem.productId,
        //     }
        //   });
        //   return {
        //     ...stockCheckResult,
        //     size: localItem.size,
        //     productTitle: product.title
        //   };
        // }

        if (existingItemInCart) {
          // console.log('existingItemInCart', existingItemInCart);
          // Check Stock
          // Update existing localItem
          await strapi.entityService.update('api::cart-item.cart-item', existingItemInCart.id, {
            data: {
              quantity: existingItemInCart.quantity + (localItem.quantity),
              size: localItem.size,
              product: localItem.productId,
            },
          });

          return {
            status: 'success',
            localCartItemId: localItem.localCartItemId,
            id: existingItemInCart.id,
          }
        } else {
          const newItem = await strapi.entityService.create('api::cart-item.cart-item', {
            data: {
              quantity: localItem.quantity,
              size: localItem.size,
              product: localItem.productId,
              localCartItemId: localItem.localCartItemId,
              publishedAt: new Date(),
              price: localItem.price,
              cart: cartId
            },
            populate: ['product', 'product.img']
          });

          console.log('createdItem', newItem);


          return {
            status: 'success',
            localCartItemId: localItem.localCartItemId,
            id: newItem.id,
          };
        }
      }));

      // console.log('results', results)


      const successResults = results.filter((result) => result.status === 'success');
      const partials = results.filter((result) => result.status === 'partial');
      const failedResults = results.filter((result) => result.status === 'failed');
      const reducedResults = existingItemsStockCheck.filter((result) => result.status === 'reduced');
      const deletedResults = existingItemsStockCheck.filter((result) => result.status === 'deleted');

      // console.log('reducedResults', reducedResults)
      const mergedCart = await strapi.entityService.findOne('api::cart.cart', cartId, {
        populate: ['items', 'items.product', 'items.product.img'],
      });

      console.log('currentCart', mergedCart?.items?.map(item => ({ id: item.product.id, size: item.size, quantity: item.quantity })))

      // Fetch and return the updated cart
      const response = {

        message: 'Cart merged',
        cartId,
        mergedCart: mergedCart.items,
        failures: failedResults,
        partials: partials,
        reduced: reducedResults,
        deleted: deletedResults,
      };

      if (failedResults.length > 0) {
        ctx.send(response, 207); // Multi-Status: Some items failed
      } else {
        ctx.send(response);
      }
    } catch (error) {
      console.error('Error updating cart:', error);
      return ctx.internalServerError('Error updating cart');
    }
  },


  async addItemToCart(ctx) {
    const { productId, quantity, size, localCartItemId, localExistingItemQuantity, price, userId } = ctx.request.body;

    console.log({quantity, size});

    if (!productId || !quantity || !size || !price || !localCartItemId) {
      return ctx.badRequest('Missing required fields');
    }

    try {
      // Find the cart
      const product = await strapi.entityService.findOne('api::product.product', productId, {
        populate: ['stocks', 'stocks.size'],
      }
      );

      // console.log('product', product)


      if (!product) {
        return ctx.notFound('Product not found');
      }


      // console.log('product', product)
      const productStock = new Map(
        product.stocks.map(stock => [stock.size.size, stock.stock])
      );
      console.log('productStock', productStock)

      const availableStock = productStock?.get(size);


      if (availableStock === 0) {
        // Send error response with available stock included
        return ctx.send({
          message: 'Out of stock',
          status: 'out-of-stock'
        }, 400);
      }
      else {
        if (userId) {
          const cart = await strapi.db.query('api::cart.cart').findOne({
            where: { user: userId }, // Properly query the relational user field
            populate: ['items', 'items.product', 'items.product.stocks.size'],
          });


          const cartId = cart?.id
          const existingItem = cart?.items?.find((item) => item.product.id === productId && item.size === size);
          const notEnoughStock = availableStock < (quantity + (existingItem?.quantity || 0));

          if (existingItem) {
            // Check stock first
            console.log('existingItem', existingItem)
            // Update existing item

            // Check whether item's current qty is greater than available stock
            const exceedsAvailableStock = existingItem.quantity > availableStock;
            let updatedItem;

            switch (true) {
              case (notEnoughStock && !exceedsAvailableStock):
                updatedItem = await strapi.db.query('api::cart-item.cart-item').update({
                  where: { id: existingItem.id },
                  data: { quantity: availableStock },
                });


                return ctx.send({
                  message: "Limted Stock",
                  status: 'partial',
                  added: availableStock - existingItem.quantity,
                  newQuantity: availableStock,
                }, 206);

              case (exceedsAvailableStock):
                updatedItem = await strapi.db.query('api::cart-item.cart-item').update({
                  where: { id: existingItem.id },
                  data: { quantity: availableStock },
                });


                return ctx.send({
                  message: "Limited Stock",
                  status: 'reduced',
                  reducedBy: existingItem.quantity - availableStock,
                  newQuantity: availableStock,
                  availableStock,
                }, 206);
              default:
                updatedItem = await strapi.db.query('api::cart-item.cart-item').update({
                  where: { id: existingItem.id },
                  data: { quantity: existingItem.quantity + quantity },
                });

                return ctx.send({
                  message: 'Item updated successfully',
                  status: 'success',
                }, 200);
            }





          }
          else {
            if (notEnoughStock) {
              const createdCartItem = await strapi.db.query('api::cart-item.cart-item').create({
                data: { cart: cartId, product: productId, quantity: availableStock, size, localCartItemId, price, publishedAt: new Date(), localCartItemId },
              });

              console.log('createdCartItem', createdCartItem)
              return ctx.send(
                {
                  message: 'Limited Stock',
                  data: createdCartItem,
                  availableStock,
                  status: 'partial'
                }, 206);
            }
            else {
              const createdCartItem = await strapi.db.query('api::cart-item.cart-item').create({
                data: { cart: cartId, product: productId, quantity: quantity, size, localCartItemId, price, publishedAt: new Date(), localCartItemId },
              });

              console.log('createdCartItem', createdCartItem)
              return ctx.send({ message: 'Successfully Added', data: createdCartItem });
            }
          }
        }
        else {
          // For Unauthenticated Users
          console.log('localExistingItemQuantity', localExistingItemQuantity)
          const notEnoughStock = availableStock < (quantity + localExistingItemQuantity);
          const existingExceedsAvailable = localExistingItemQuantity > availableStock;
          const existingQuantityAlreadyMax = localExistingItemQuantity === availableStock;
          console.log('existingQuantityAlreadyMax', existingQuantityAlreadyMax);



          if (existingQuantityAlreadyMax) {
            return ctx.send({
              message: 'All available stock already in cart',
              status: 'max-stock'
            }, 400);
          }

          else if (existingExceedsAvailable) {
            return ctx.send({
              message: "Limited Stock",
              status: 'reduced',
              reducedBy: localExistingItemQuantity - availableStock,
              newQuantity: availableStock,
              availableStock
            }, 206);
          }

          else if (notEnoughStock) {
            return ctx.send({
              message: 'Limited Stock',
              status: 'partial',
              added: availableStock - localExistingItemQuantity,
              newQuantity: availableStock,
            }, 206);
          }

          else {
            if (localExistingItemQuantity <= 0) {
              return ctx.send({ message: 'Allowed to add', status: 'success' });
            }
            else {
              return ctx.send({ message: 'Allowed to update', status: 'success' });
            }
          }
        }
      }


      // Check if item already exists in the cart



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
