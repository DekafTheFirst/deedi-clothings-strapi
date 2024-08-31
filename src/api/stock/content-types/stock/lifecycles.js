// src/api/stock/models/stock.js


const { ApplicationError } = require('@strapi/utils').errors;


module.exports = {
    async beforeCreate(event) {
        console.log(event.params)
        const { data } = event.params;
        const { product, size } = data;

        // console.log('product', product);
        // console.log('size', size);


        if (product?.connect?.length <= 0) {
            throw new ApplicationError('Product is required.', { foo: 'bar' });
        }

        if (size?.connect?.length <= 0) {
            throw new ApplicationError('Size is required.');
        }



        const existingStock = await strapi.db.query('api::stock.stock').findOne({
            where: {
                product: {
                    id: product.connect[0].id,
                },
                size: {
                    id: size.connect[0].id,
                },
            },
        });

        if (existingStock) {
            throw new Error('Stock entry for this product-size combination already exists.');
        }
    },
    async beforeUpdate(event) {
        const { data } = event.params;
        const { product, size } = data

        // console.log('product', product);
        // console.log('size', size);
        // const query = {};
        // if () {
        //     query['product'] = product?.connect?.[0]?.id || product?.id;
        // }
        // if () {
        //     query['size'] = size?.connect?.[0]?.id || size?.id;
        // }



        // Ensure query is not empty
        // if (Object.keys(query).length === 0) {
        //     return; // No relevant fields to check
        // }

        // Check if product or size was disconnected and throw error
        if (product?.disconnect?.length > 0) {
            throw new Error('Product is required');
        }

        if (size?.disconnect?.length > 0) {
            throw new Error('Size is required');
        }


        let existingStock

        if (size?.connect?.length > 0 && product?.connect?.length > 0) {
            existingStock = await strapi.db.query('api::stock.stock').findOne({
                where: {
                    product: {
                        id: product?.connect?.[0]?.id,
                    },
                    size: {
                        id: size?.connect[0]?.id,
                    },
                    id: {
                        $ne: event?.params?.where?.id,  // Ensure it's not checking the current entry
                    },
                },
            });
        }

        if (existingStock) {
            throw new Error('Stock entry for this product-size combination already exists.');
        }
    },
};
