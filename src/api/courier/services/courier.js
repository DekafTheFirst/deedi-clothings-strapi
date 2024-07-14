'use strict';

/**
 * courier service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::courier.courier');
