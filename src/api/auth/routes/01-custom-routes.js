const auth = require("../controllers/auth");

module.exports = {
    routes: [
      {
        method: 'POST',
        path: '/auth/firebase',
        handler: 'auth.firebaseAuth',
        config: {
          auth: false,
          policies: [],
          middlewares: ['global::verifyFirebaseToken'],
        },
      },
    ],
  };
  