// path: ./src/services/easyship.js

const axios = require('axios');

const EASYSHIP_API_KEY = process.env.EASYSHIP_API_KEY;

module.exports = {
  getCouriers: async (address) => {
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
              items: address.items.map(item => ({
                quantity: item.quantity,
                weight: item.weight,
                dimensions: item.dimensions, // Assuming dimensions includes length, width, height
              })),
            },
          ],
          shipping_settings: { units: { dimensions: 'cm', weight: 'kg' } },
        },
      };

      const response = await axios.request(options);
      return response.data;
    } catch (error) {
      console.error('Error fetching couriers', error);
      throw error;
    }
  },
};
