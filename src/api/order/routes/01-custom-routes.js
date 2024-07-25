module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/orders/couriers',
            handler: 'order.getCouriers',
            config: {
                auth: false,
            },
        },
        {
            method: 'POST',
            path: '/api/orders/webhook',
            handler: 'order.handleStripeWebhook',
            config: {
              policies: [],
              middlewares: [],
            },
          },
        

    ],
};