'use strict';

/**
 * stock service
 */

const { createCoreService } = require('@strapi/strapi').factories;

'use strict';

module.exports = {
  /**
   * Checks the available stock for a specific product and size.
   *
   * @param {object} strapi - The Strapi instance.
   * @param {number|string} productId - The ID of the product.
   * @param {number|string} sizeId - The ID of the size.
   * @param {number} requestedQuantity - The quantity to check for.
   * @param {number} existingCartQuantity - The quantity already in the cart.
   * @returns {object} - The result of the stock check with status and additional information.
   */
  async checkStock(strapi, productId, sizeId, requestedQuantity, existingCartQuantity = 0) {
    try {
      // Fetch the stock record for the product and size
      const stock = await strapi.db.query('api::stock.stock').findOne({
        where: { product: productId, size: sizeId },
        populate: ['size']
      });

      if (!stock) {
        return { status: 'failed', reason: 'Stock record not found' };
      }

      const availableStock = stock.stock;
      const totalRequestedQuantity = requestedQuantity + existingCartQuantity;

      // Determine stock status
      if (availableStock <= 0) {
        return { status: 'out-of-stock', reason: 'Out of stock' };
      }

      if (totalRequestedQuantity > availableStock) {
        if (availableStock - existingCartQuantity <= 0) {
          return { status: 'max-stock-already', reason: 'Max stock already in cart' };
        }
        return {
          status: 'partial',
          added: availableStock - existingCartQuantity,
          reason: 'Limited stock'
        };
      }

      return { status: 'success', availableStock };
    } catch (error) {
      console.error('Error checking stock:', error);
      return { status: 'error', reason: 'Error checking stock' };
    }
  }
};
