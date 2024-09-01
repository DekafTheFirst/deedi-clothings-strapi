'use strict';

/**
 * cart-item service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::cart-item.cart-item', ({ strapi }) => ({
    // Assuming this is located in `api/stock/services/stock.js` or similar
    async validateCartItem({ item, userCartItemsMap = null, requestedQuantity, cartId }) {
        const { productId, size, quantity: currentQuantity, localCartItemId, strapiCartItemId } = item;
        // console.log("ProductId: ", productId, ',requested: ', requestedQuantity)
        // console.log('cartId', cartId);
        try {

            // Fetch product and stock details
            let result

            const product = await strapi.query('api::product.product').findOne({
                where: { id: productId },
                populate: { images: true }
            });



            // console.log('product', product.images)
            if (!product) {
                return {
                    message: 'Product not found',
                    status: 'out-of-stock',
                    productId,

                };
            };

            const { price, discountedPrice } = product
            const img = product?.images?.[0]?.formats?.thumbnail?.url || product?.images?.[0]?.url
            // console.log('img', img)

            const stock = await strapi.query('api::stock.stock').findOne({
                where: { product: productId, size: size.id },
                populate: {
                    product: {
                        fields: ['title']
                    }
                }
            });


            if (!stock) {
                return {
                    message: 'Stock not found',
                    status: 'out-of-stock',
                    ...productDetails
                };
            }

            const productDetails = {
                localCartItemId,
                productTitle: product.title,
                productId,
                stockId: stock.id,
                size,
                img,
                price: price,
                discountedPrice: discountedPrice,
            }

            const availableStock = stock.stock;

            // Determine if we need to check against user cart items
            let cartItem;
            if (strapiCartItemId) {
                cartItem = userCartItemsMap
                    ? userCartItemsMap[strapiCartItemId]
                    : await strapi.query('api::cart-item.cart-item').findOne({ where: { id: strapiCartItemId, cart: cartId } });
            }

            // console.log('availableStock', availableStock)
            if (availableStock <= 0) {
                // Mark as out of stock in the cart
                if (cartItem) {
                    await strapi.entityService.update('api::cart-item.cart-item', strapiCartItemId, {
                        data: { outOfStock: true },
                    });
                }

                return {
                    message: 'Out of stock',
                    status: 'out-of-stock',
                    ...productDetails,
                };
            }

            if (currentQuantity > availableStock) {
                if (cartItem) {
                    await strapi.entityService.update('api::cart-item.cart-item', strapiCartItemId, {
                        data: { quantity: availableStock },
                    });
                }

                return {
                    message: "Limited Stock",
                    status: 'reduced',
                    quantity: currentQuantity,
                    reducedBy: currentQuantity - availableStock,
                    newQuantity: availableStock,
                    availableStock,
                    ...productDetails,
                };
            }

            return {
                message: 'Success',
                status: 'success',
                quantity: currentQuantity,
                availableStock,
                ...productDetails
            }


        } catch (error) {
            console.error(error)
            return {
                message: `Error validating stock: ${error.message}`,
                status: 'validation-error',
                localCartItemId,
                productTitle: 'Unknown Product',
                productId,
            };
        }
    },

    async batchValidateCartItems({ items, cartId, userId }) {
        // console.log('userId', userId)
        // console.log('cartId', cartId)
        // console.log('items', items)

        try {
            const userCartItems = cartId && await strapi.db.query('api::cart-item.cart-item').findMany({
                where: {
                    cart: cartId,
                }
            });


            const userCartItemsMap = userCartItems?.reduce((acc, item) => {
                acc[item.id] = item;
                return acc;
            }, {});

            const results = {
                success: [],
                reduced: [],
                outOfStock: []
            };

            // Map over items and create an array of promises for validation
            const validationPromises = items.map(async (item) => this.validateCartItem({
                item,
                cartId,
                userCartItemsMap
            }));



            // Wait for all validation promises to complete
            const resultsArray = await Promise.all(validationPromises);
            // console.log('resultsArray', resultsArray)

            // Categorize results
            resultsArray.forEach(result => {
                if (result.status === 'out-of-stock') {
                    results.outOfStock.push(result);
                } else if (result.status === 'reduced') {
                    results.reduced.push(result);
                } else if (result.status === 'success') {
                    results.success.push(result);
                }
            });

            // console.log('resultsArray', resultsArray)
            return results;
        }
        catch (error) {
            // console.error('Error in batch stock validation:', error)
            throw error
        }
    },

    // ... other methods






    async updateCartItem({ cartItemId, newQuantity }) {
        try {
            const updatedItem = await strapi.entityService.update('api::cart-item.cart-item', cartItemId, {
                data: { quantity: newQuantity },
            });
            return updatedItem;
        } catch (error) {
            throw new Error(`Failed to update cart item: ${error.message}`);
        }
    },

    async handleOutOfStock({ cartItemId }) {
        try {
            const updatedItem = await strapi.entityService.update('api::cart-item.cart-item', cartItemId, {
                data: { outOfStock: true },
            });
            return updatedItem;
        } catch (error) {
            throw new Error(`Failed to update item as out of stock: ${error.message}`);
        }
    },



    async addItemToCart({ cartId, productId, sizeId, quantity, localCartItemId }) {
        try {
            const newCartItem = await strapi.entityService.create('api::cart-item.cart-item', {
                data: {
                    cart: cartId,
                    product: productId,
                    quantity,
                    size: sizeId,
                    localCartItemId,
                    publishedAt: new Date(),
                },
            });
            return newCartItem;
        } catch (error) {
            throw new Error(`Failed to add item to cart: ${error.message}`);
        }
    },
}));
