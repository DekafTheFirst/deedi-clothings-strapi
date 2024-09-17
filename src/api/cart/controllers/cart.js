
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
                populate: ['images'],
                fields: ['title', 'img']
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
      console.log('items', items.map(item => ({ id: item.productId, size: item.size.size, quantity: item.quantity })))
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
        populate: ['items', 'items.product', 'items.size', 'items.product.stocks.size'],
      });

      // console.log('currentCart', currentCart)

      const cartId = currentCart.id;

      console.log('currentCart', currentCart?.items?.map(item => ({ id: item.product.id, size: item.size, quantity: item.quantity })))


      if (!currentCart) {
        return ctx.notFound('Cart not found');
      }

      // Check if any items need to be reduced or removed from cart 
      const existingItemsStockCheck = await Promise.all(currentCart.items.map(async (existingItem) => {

        const stock = await strapi.db.query('api::stock.stock').findOne({
          where: { product: existingItem.product.id, size: existingItem.size.id },
          populate: ['size']
        });

        console.log('stock', stock)

        const availableStock = stock.stock
        const totalQuantityInCart = existingItem ? existingItem.quantity : 0;

        if (availableStock <= 0) {
          await strapi.entityService.update('api::cart-item.cart-item', existingItem.id, {
            data: { outOfStock: true },
          });

          return {
            status: 'out-of-stock',
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
        const existingItemInCart = currentCart.items.find((cartItem) => cartItem.product.id == localItem.productId && cartItem.size.id === localItem.size.id);
        console.log('existingItemInCart', existingItemInCart)

        const stock = await strapi.db.query('api::stock.stock').findOne({
          where: { product: localItem.productId, size: localItem.size.id },
          populate: ['size']
        });

        console.log('stock', stock)

        const availableStock = stock.stock
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
            productTitle: localItem.title
          };
        }

        if (stockCheckResult.status === 'partial') {
          if (existingItemInCart) {
            await strapi.entityService.update('api::cart-item.cart-item', existingItemInCart.id, {
              data: {
                quantity: stockCheckResult.added + totalQuantityInCart,
              }
            });
          }

          return {
            ...stockCheckResult,
            size: localItem.size,
            productTitle: localItem.title
          };
        }

        // if (stockCheckResult.status === 'reduced') {
        //   await strapi.entityService.update('api::cart-item.cart-item', existingItemInCart ? existingItemInCart.id : undefined, {
        //     data: {
        //       quantity: availableStock,
        //       size: localItem.size.size,
        //       product: localItem.productId,
        //     }
        //   });
        //   return {
        //     ...stockCheckResult,
        //     size: localItem.size.size,
        //     productTitle: product.title
        //   };
        // }

        if (existingItemInCart) {
          // console.log('existingItemInCart', existingItemInCart);
          // Check Stock
          await strapi.entityService.update('api::cart-item.cart-item', existingItemInCart.id, {
            data: {
              quantity: existingItemInCart.quantity + (localItem.quantity),
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
              size: localItem.size.id,
              product: localItem.productId,
              localCartItemId: localItem.localCartItemId,
              publishedAt: new Date(),
              cart: cartId
            },
            populate: ['product', 'product.images']
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
      const outOfStockResults = existingItemsStockCheck.filter((result) => result.status === 'out-of-stock');
      console.log('results', results)
      // console.log('reducedResults', reducedResults)
      const mergedCart = await strapi.entityService.findOne('api::cart.cart', cartId, {
        populate: ['items', 'items.size', 'items.product', 'items.product.images'],
      });


      console.log('currentCart', mergedCart?.items?.map(item => ({ id: item.product.id, size: item.size, quantity: item.quantity, outOfStock: item.outOfStock })))

      // Fetch and return the updated cart
      const response = {
        message: 'Cart merged',
        cartId,
        mergedCart: mergedCart.items,
        failures: failedResults,
        partials: partials,
        reduced: reducedResults,
        outOfStock: outOfStockResults,
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
    const { productId, quantity: requestedQuantity, size, localCartItemId, existingLocalCartItemQty, userId, cartId } = ctx.request.body;
    console.log('requestedQuantity', requestedQuantity)
    console.log({ requestedQuantity, size });

    if (!productId || !requestedQuantity || !size || !localCartItemId) {
      return ctx.badRequest('Missing required fields');
    }

    try {
      // Find the cart

      // console.log('productStock', productStock)
      const stock = await strapi.db.query('api::stock.stock').findOne({
        where: { product: productId, size: size.id }
      });

      const availableStock = stock.stock

      console.log('availableStock', availableStock)

      const userIsAuthenticated = userId ? true : false;

      const cart = userIsAuthenticated && await strapi.entityService.findOne('api::cart.cart', cartId, { // Properly query the relational user field
        populate: ['items', 'items.size', 'items.product', 'items.product.stocks.size'],
      });

      console.log('cart', cart)

      const existingStrapiCartItem = cart?.items?.find((item) => item.product.id === productId && item.size.size === size.size);
      const itemExistsLocally = existingLocalCartItemQty > 0;

      console.log('existingStrapiCartItem', existingStrapiCartItem)
      const limitedStock = availableStock < (requestedQuantity + existingLocalCartItemQty);
      console.log('limitedStock', limitedStock)

      if (availableStock <= 0) {
        // Send error response with available stock included
        if (existingStrapiCartItem) {
          const updatedItem = await strapi.db.query('api::cart-item.cart-item').update({
            where: { id: existingStrapiCartItem.id },
            data: { outOfStock: true },
          });
        }

        return ctx.send({
          message: 'Out of stock',
          status: 'out-of-stock',
        }, 400);
      }
      else if (availableStock === existingLocalCartItemQty) {
        return ctx.send({
          message: 'Available Stock Already In Your Cart',
          status: 'max-stock-already',
          availableStock: availableStock,
          localCartItemId
        }, 400);
      }
      else {
        if (itemExistsLocally) {
          console.log('itemExistsLocally', itemExistsLocally)
          // Check stock first
          // Update existing item
          // Check whether item's current qty is greater than available stock
          const currentQtyExeedsLimit = existingLocalCartItemQty > availableStock;
          let updatedItem;

          switch (true) {
            case (limitedStock && !currentQtyExeedsLimit):
              if (userIsAuthenticated) {
                updatedItem = await strapi.db.query('api::cart-item.cart-item').update({
                  where: { id: existingStrapiCartItem.id },
                  data: { quantity: availableStock },
                });
              }
              const added = availableStock - existingLocalCartItemQty;

              if (added > 0) {
                return ctx.send({
                  message: "Limited Stock",
                  status: 'partial',
                  added,
                  newQuantity: availableStock,
                }, 206);
              }
              else { //On probation
                return ctx.send({
                  message: "Limted Stock",
                  status: 'max-stock-already',
                  added,
                  newQuantity: availableStock,
                }, 400);
              }
            case (currentQtyExeedsLimit):
              if (userIsAuthenticated) {
                updatedItem = await strapi.db.query('api::cart-item.cart-item').update({
                  where: { id: existingStrapiCartItem.id },
                  data: { quantity: availableStock },
                });
              }


              return ctx.send({
                message: "Limited Stock",
                status: 'reduced',
                reducedBy: existingLocalCartItemQty - availableStock,
                newQuantity: availableStock,
                availableStock,
              }, 206);
            default:
              if (userIsAuthenticated) {
                updatedItem = await strapi.db.query('api::cart-item.cart-item').update({
                  where: { id: existingStrapiCartItem?.id },
                  data: { quantity: existingLocalCartItemQty + requestedQuantity },
                });
              }

              if (existingLocalCartItemQty <= 0) {
                return ctx.send({ message: 'Allowed to add', status: 'success' });
              }
              else {
                return ctx.send({ message: 'Allowed to update', status: 'success' });
              }
          }
        }
        else {
          if (limitedStock) {
            let createdCartItem;
            if (userIsAuthenticated) {
              createdCartItem = await strapi.db.query('api::cart-item.cart-item').create({
                data: { cart: cartId, product: productId, quantity: availableStock, size: size.id, localCartItemId, publishedAt: new Date(), localCartItemId },
              });

              console.log('createdCartItem', createdCartItem)
            }

            return ctx.send(
              {//On Probation
                message: 'Limited Stock',
                data: createdCartItem,
                availableStock,
                added: availableStock,
                status: 'partial'
              }, 206);
          }
          else {
            let createdCartItem
            if (userIsAuthenticated) {
              createdCartItem = await strapi.db.query('api::cart-item.cart-item').create({
                data: { cart: cartId, product: productId, quantity: requestedQuantity, size: size.id, localCartItemId, publishedAt: new Date(), localCartItemId },
              });

              console.log('createdCartItem', createdCartItem)
            }

            return ctx.send({
              message: 'Successfully Added',
              data: createdCartItem,
              status: 'success',
            });
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
    const { currentQuantity, requestedQuantity, productId, size, localCartItemId, userId } = ctx.request.body;
    const { strapiCartItemId } = ctx.params;
    console.log('strapiCartItemId', strapiCartItemId)
    if (requestedQuantity < 0) {
      return ctx.badRequest('invalid Input: Requested quantity must be an a positive integer greater that or equal to 0');
    }
    if (!localCartItemId || !productId || !size) {
      return ctx.badRequest('Missing required fields');
    }


    const existingStrapiCartItem = strapiCartItemId && await strapi.entityService.findOne("api::cart-item.cart-item", strapiCartItemId)

    const stock = await strapi.db.query("api::stock.stock").findOne({
      where: { product: productId, size: size },
    })


    const availableStock = stock.stock;
    const userIsAuthenticated = userId ? true : false

    // console.log('existingStrapiCartItem', existingStrapiCartItem)
    // console.log('currentQuantity', currentQuantity)
    // console.log('requestedQuantity', requestedQuantity)
    // console.log('availableStock', availableStock)
    // console.log('userIsAuthenticated', userIsAuthenticated);
    const ACTION_TYPES = {
      INCREASE: 'INCREASE',
      DECREASE: 'DECREASE',
    };

    const actionType = currentQuantity < requestedQuantity ? ACTION_TYPES.INCREASE : ACTION_TYPES.DECREASE;
    try {

      if (availableStock <= 0) {
        // Send error response with available stock included
        if (userIsAuthenticated) {
          const updatedItem = await strapi.entityService.update('api::cart-item.cart-item', existingStrapiCartItem.id, {
            data: { outOfStock: true },
          });
        }

        return ctx.send({
          message: 'Out of stock',
          status: 'out-of-stock',
        }, 400);
      }

      if (availableStock === currentQuantity && actionType == ACTION_TYPES.INCREASE) {
        return ctx.send({
          message: 'Available Stock Already In Your Cart',
          status: 'max-stock-already',
          availableStock: availableStock,
        }, 400);
      }


      // Check stock first
      // Update existing item
      // Check whether item's current qty is greater than available stock
      const currentQtyExeedsLimit = (currentQuantity > availableStock) && ((currentQuantity - availableStock) > 1);
      console.log('currentQtyExeedsLimit', currentQtyExeedsLimit)

      let updatedItem;

      if (currentQtyExeedsLimit) {
        if (userIsAuthenticated) {
          await strapi.entityService.update('api::cart-item.cart-item', existingStrapiCartItem.id, {
            data: { quantity: availableStock },
          });
        }

        return ctx.send({
          message: "Limited Stock",
          status: 'reduced',
          reducedBy: currentQuantity - availableStock,
          newQuantity: availableStock,
          availableStock,
        }, 206);
      }

      if (userIsAuthenticated) {
        const updatedCartItem = await strapi.entityService.update('api::cart-item.cart-item', existingStrapiCartItem.id, {
          data: { quantity: requestedQuantity },
        });
        console.log('updatedCartItem', updatedCartItem); 
      }

      return ctx.send({
        message: 'Allowed to update',
        status: 'success',
        availableStock
      });

    } catch (error) {
      console.log(error);
      return ctx.internalServerError('Failed to update item');
    }
  },


  // async validateStock(ctx) {
  //   const { items, cartId } = ctx.request.body;
  //   console.log('items', items)

  //   console.log('items', items.map(item => ({ id: item.productId, size: item.size.size, quantity: item.quantity })))


  //   if (!items) {
  //     return ctx.badRequest('List of items is required');
  //   }

  //   try {
  //     const userIsAuthenticated = ctx.state.isAuthenticated;
  //     console.log('state', ctx.state);
  //     const userId = ctx.state.user?.id;
  //     console.log('userId', userId)
  //     let existingStrapiCartItems = [];


  //     if (userIsAuthenticated) {
  //       const strapiCartItemIds = items.map(item => item.strapiCartItemId).filter(Boolean);
  //       console.log('strapiCartItemIds', strapiCartItemIds)
  //       existingStrapiCartItems = await strapi.entityService.findMany("api::cart-item.cart-item", {
  //         filters: {
  //           id: { $in: strapiCartItemIds },
  //           cart: cartId,  // Replace with your actual cart ID field name
  //           user: userId,
  //         },
  //         populate: ['product', 'size']
  //       });
  //     }

  //     // console.log('existingStrapiCartItem', existingStrapiCartItems)

  //     console.log('existingStrapiCartItems', existingStrapiCartItems.map(item => ({ id: item.product.id, size: item.size.size, quantity: item.quantity })))


  //     const existingStrapiCartItemsDict = {};
  //     existingStrapiCartItems.forEach(item => {
  //       existingStrapiCartItemsDict[item.id] = item;
  //     });

  //     // console.log('existingStrapiCartItemsDict', existingStrapiCartItemsDict)



  //     // const results = await Promise.all(items.map(async (item) => {
  //     //   const { quantity, productId, size, localCartItemId, userId, strapiCartItemId, outOfStock } = item;
  //     //   const stock = await strapi.db.query("api::stock.stock").findOne({
  //     //     where: { product: productId, size: size },
  //     //     populate: ['product']
  //     //   })




  //     //   const availableStock = stock.stock;
  //     //   const existingStrapiCartItem = existingStrapiCartItemsDict[strapiCartItemId];

  //     //   // console.log('existingStrapiCartItem', existingStrapiCartItem)
  //     //   // console.log('quantity', quantity)
  //     //   console.log('availableStock', availableStock)
  //     //   // console.log('userIsAuthenticated', userIsAuthenticated);


  //     //   if (availableStock <= 0) {
  //     //     // Send error response with available stock included
  //     //     if (userIsAuthenticated) {
  //     //       const updatedItem = await strapi.entityService.update('api::cart-item.cart-item', existingStrapiCartItem.id, {
  //     //         data: { outOfStock: true },
  //     //       });
  //     //     }

  //     //     return {
  //     //       message: 'Out of stock',
  //     //       status: 'out-of-stock',
  //     //       size: size,
  //     //       localCartItemId,
  //     //       productTitle: stock.product.title
  //     //     };
  //     //   }

  //     //   // Check stock first
  //     //   // Update existing item
  //     //   // Check whether item's current qty is greater than available stock
  //     //   const currentQtyExeedsLimit = (quantity > availableStock);
  //     //   console.log('currentQtyExeedsLimit', currentQtyExeedsLimit)

  //     //   let updatedItem;

  //     //   if (currentQtyExeedsLimit) {
  //     //     if (userIsAuthenticated) {
  //     //       await strapi.entityService.update('api::cart-item.cart-item', existingStrapiCartItem.id, {
  //     //         data: { quantity: availableStock },
  //     //       });
  //     //     }

  //     //     return {
  //     //       message: "Limited Stock",
  //     //       productTitle: stock.product.title,
  //     //       size: size,
  //     //       status: 'reduced',
  //     //       localCartItemId,
  //     //       reducedBy: quantity - availableStock,
  //     //       newQuantity: availableStock,
  //     //       availableStock,
  //     //     };
  //     //   }

  //     //   return {
  //     //     message: 'Success',
  //     //     status: 'success',
  //     //     availableStock,
  //     //     localCartItemId,
  //     //     productTitle: stock.product.title,
  //     //   };
  //     // }
  //     // ))

  //     const results = await stockService.validateStockItems(items, userId, cartId);
  //     console.log('results', results)

  //     const successResults = results.filter((result) => result.status === 'success');
  //     const reducedResults = results.filter((result) => result.status === 'reduced');
  //     const outOfStockResults = results.filter((result) => result.status === 'out-of-stock');

  //     const response = {
  //       message: 'Cart merged',
  //       cartId,
  //       reduced: reducedResults,
  //       outOfStock: outOfStockResults,
  //     };


  //     ctx.send({
  //       success: successResults,
  //       reduced: reducedResults,
  //       outOfStock: outOfStockResults,
  //     });

  //   }
  //   catch (error) {
  //     console.error(error)
  //     ctx.throw(500, `Failed to validate stock: ${error.message}`);
  //   }

  // },





  async removeItemFromCart(ctx) {
    try {
      const { cartId, itemId } = ctx.params; // Assuming cartId and itemId are passed in the URL
      // console.log(cartId, itemId)
      // Find the cart
      // const cart = await strapi.db.query('api::cart.cart').findOne({ where: { id: cartId } });
      // if (!cart) {
      //   return ctx.badRequest('Cart not found');
      // }

      // Find the cart item
      const cartItem = await strapi.db.query('api::cart-item.cart-item').findOne({
        where: { id: itemId, cart: cartId }
      });

      // console.log(cartItem)


      if (!cartItem) {
        return ctx.badRequest('Item not found in cart');
      }

      // Remove the item
      await strapi.entityService.delete('api::cart-item.cart-item', itemId);

      // Return a success message
      return ctx.send({ message: 'Item removed successfully' });
    } catch (error) {
      ctx.throw(500, `Failed to remove item from cart: ${error.message}`);
    }

  },




  async validateStock(ctx) {
    const { items, cartId } = ctx.request.body;
    const { user, isAuthenticated } = ctx.state;
    

    // console.log('items', items)
    if (!items) {
      return ctx.badRequest('List of items is required');
    }

    try {
      // Call the service method to validate stock
      const validationResults = await strapi.service('api::cart-item.cart-item').batchValidateCartItems({
        items,
        userId: user?.id,
        cartId
      });

      // console.log('validationResults', validationResults)
      

      ctx.send({message: 'Cart Items Validated Successfuly', validationResults});
    } catch (error) {
      console.error('Failed to validate stock:\n', error)
      ctx.internalServerError('An error occured during stock validation');
    }
  },


}));
