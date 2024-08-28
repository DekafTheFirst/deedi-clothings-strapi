'use strict';

/**
 * stock-reservation service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock-reservation.stock-reservation');
