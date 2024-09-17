module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/orders/couriers',
            handler: 'order.getCouriers',
            config: {
            },
        },
        {
            method: 'POST',
            path: '/orders/webhook',
            handler: 'order.handleStripeWebhook',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        
        {
            method: 'POST',
            path: '/orders/easyship-webhook',
            handler: 'order.handleEasyshipWebhook',
            config: {
                policies: [],
                middlewares: [],
            },
        },


    ],
};