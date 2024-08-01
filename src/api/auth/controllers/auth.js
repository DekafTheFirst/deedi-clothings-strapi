const { sanitize } = require('@strapi/utils');

module.exports = {
    async firebaseAuth(ctx) {
        try {
            const { uid, email, name, picture } = ctx.state.user; // Use the user context set by middleware
            // Check if the user exists in Strapi
            let user = await strapi.query('plugin::users-permissions.user').findOne({
                where: { email },
            });

            console.log('user', user)


            if (!user) {
                // Create a new user in Strapi
                user = await strapi.query('plugin::users-permissions.user').create({
                    data: {
                        username:name,
                        photoUrl: picture,
                        email,
                        uid,
                        provider: 'firebase',
                        confirmed: true,
                        role: '1', // Assuming '1' is the ID of the authenticated role
                    },
                });
            }

            ctx.send({
                message: 'User authenticated successfully',
                user: sanitize.contentAPI.query(user, { model: strapi.query('plugin::users-permissions.user').model }),
            });
        } catch (error) {
            console.log('error in auth controller', error)
            ctx.status = 500;
            ctx.body = { error: 'Internal Server Error' };
        }
    },
};
