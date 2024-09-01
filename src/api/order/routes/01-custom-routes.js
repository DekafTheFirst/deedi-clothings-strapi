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
            path: '/orders/webhook',
            handler: 'order.handleStripeWebhook',
            config: {
                auth: false,  // This makes the endpoint unauthenticated
                policies: [],
                middlewares: [],
            },
        },
        


    ],
};