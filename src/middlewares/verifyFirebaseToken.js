// src/middlewares/verifyFirebaseToken.js
const admin = require('../../config/firebaseAdmin');


module.exports = (config, { strapi }) => {
  return async (ctx, next) => {


    const { idToken } = ctx.request.body;
    console.log('idToken:', idToken);


    if (!idToken) {
      ctx.status = 401;
      ctx.body = { error: 'No token provided' };
      return;
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      console.log('Decoded Token:', decodedToken);
      ctx.state.user = decodedToken;

      await next();
      // Ensure the next middleware or route handler is called
    } catch (error) {
      console.log('Token Verification Error:', error);
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
    }
  };
};
