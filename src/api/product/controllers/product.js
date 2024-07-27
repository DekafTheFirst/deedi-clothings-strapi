'use strict';

/**
 * product controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const stripe = require("stripe")(process.env.STRIPE_KEY);


module.exports = createCoreController('api::product.product')


