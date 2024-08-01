// src/middlewares/verifyFirebaseToken.js
const admin = require('../../config/firebaseAdmin');

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    const authorizationHeader = ctx.request.header.authorization;

    if (!authorizationHeader) {
      ctx.status = 401;
      ctx.body = { error: 'No authorization header' };
      return;
    }

    const idToken = authorizationHeader.split(' ')[1]; // Extract token from 'Bearer <token>'
    
    if (!idToken) {
      ctx.status = 401;
      ctx.body = { error: 'No token provided' };
      return;
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      ctx.state.user = decodedToken;
      await next(); // Ensure the next middleware or route handler is called
    } catch (error) {
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
    }
  };
};
