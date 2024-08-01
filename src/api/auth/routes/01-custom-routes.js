module.exports = {
    routes: [
      {
        method: 'POST',
        path: '/auth/firebase',
        handler: 'auth.firebaseAuth',
        config: {
          policies: [],
          middlewares: ['global::verifyFirebaseToken'],
        },
      },
    ],
  };
  