'use strict';

/**
 * shipping-address service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::shipping-address.shipping-address');
