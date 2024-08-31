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
        {
            method: 'PATCH',
            path: '/orders/initialize-checkout',
            handler: 'order.initializeCheckout',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'POST',
            path: '/orders/verify-checkout',
            handler: 'order.verifyCheckout',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'POST',
            path: '/orders/checkout/end',
            handler: 'order.endCheckoutSession',
            config: {
                policies: [],
                middlewares: [],
            },
        },


    ],
};