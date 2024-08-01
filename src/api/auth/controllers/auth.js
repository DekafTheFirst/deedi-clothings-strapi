// src/api/auth/controllers/auth.js
module.exports = {
    async firebaseAuth(ctx) {
        try {
            const user = ctx.state.user;
            console.log("user", user);
            // Handle additional logic here, like creating a user in Strapi if not exists
            ctx.send({ user });
        } catch (error) {
            console.log('error authenticating user', error)
            ctx.send({ success: false, error });
        }
    }
};
