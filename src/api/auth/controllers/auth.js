const { sanitize } = require('@strapi/utils');

module.exports = {
    async firebaseAuth(ctx) {
        try {
            const { uid, email } = ctx.state.user; // Use the user context set by middleware
            // Check if the user exists in Strapi
            // console.log(ctx.state.user);
            let user = await strapi.query('plugin::users-permissions.user').findOne({
                where: { email },

            });

            const { displayName, photoURL } = ctx.request.body;

            // console.log('displayName', displayName)
            // console.log('photoUrl', photoURL)



            if (!user) {
                // Create a new user in Strapi
                user = await strapi.query('plugin::users-permissions.user').create({
                    data: {
                        username: displayName,
                        photoUrl: photoURL,
                        email,
                        uid,
                        provider: 'firebase',
                        confirmed: true,
                        role: '1', // Assuming '1' is the ID of the authenticated role
                    },
                });

            }

            else if (displayName || photoURL) {
                user = await strapi.query('plugin::users-permissions.user').update({
                    where: { email },
                    data: {
                        username: displayName,
                        photoUrl: photoURL,
                        // Assuming '1' is the ID of the authenticated role
                    },
                });
                console.log('updated user successfully', user)
            }


            const sanitizedUser = await sanitize.contentAPI.query(user, { model: strapi.query('plugin::users-permissions.user').model })

            console.log('sanizedUser', sanitizedUser)

            ctx.send({
                message: 'User authenticated successfully',
                user: sanitizedUser,
            });
        } catch (error) {
            console.log('error in auth controller', error)
            ctx.status = 500;
            ctx.body = { error: 'Internal Server Error' };
        }
    },
};
