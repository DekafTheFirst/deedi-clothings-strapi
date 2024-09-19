module.exports = {
    routes: [
        {
            method: 'PATCH',
            path: '/checkout/initialize',
            handler: 'checkout.initializeCheckout',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'POST',
            path: '/checkout/create-payment-intent',
            handler: 'checkout.createPaymentIntent',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'POST',
            path: '/checkout/end',
            handler: 'checkout.endCheckoutSession',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        
    ],
};