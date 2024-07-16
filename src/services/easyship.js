// In your Strapi controller (e.g., api/order/controllers/order.js)

const axios = require('axios');

module.exports = {
  async getCouriers(ctx) {
    const { address, items } = ctx.request.body;

    const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;

    try {
      const options = {
        method: 'POST',
        url: 'https://api.easyship.com/2023-01/rates',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          Authorization: `Bearer ${EASYSHIP_API_KEY}`,
        },
        data: {
          courier_selection: { apply_shipping_rules: true, show_courier_logo_url: false },
          destination_address: { country_alpha2: address.country },
          incoterms: 'DDU',
          insurance: { is_insured: false },
          parcels: [
            {
              items: items.map(item => ({
                quantity: item.quantity,
                weight: item.weight,
                dimensions: {
                  length: item.length,
                  width: item.width,
                  height: item.height,
                },
              })),
            },
          ],
          shipping_settings: { units: { dimensions: 'inches', weight: 'lb' } },
        },
      };

      const response = await axios.request(options);
      ctx.send(response.data);
    } catch (error) {
      
      console.error('Error fetching couriers', error);
      ctx.throw(500, 'Failed to fetch couriers');
    }
  },
};
