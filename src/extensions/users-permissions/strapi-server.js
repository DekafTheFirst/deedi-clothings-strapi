module.exports = (plugin) => {
    plugin.controllers.user.updateMe = async (ctx) => {
        if (!ctx.state.user || !ctx.state.user.id) {
            return ctx.response.status = 401;
        }
        // Extract only the fields that need to be updated from the request body
        const userUpdates = ctx.request.body;
        console.log('userUpdates', userUpdates)
        try {
            // Update the user data in the database
            await strapi.query('plugin::users-permissions.user').update({
                where: { id: ctx.state.user.id },
                data: userUpdates,
            });
            ctx.response.status = 200;
        } catch (error) {
            console.error('Error updating user data:', error);
            ctx.response.status = 500;
        }
    };
    plugin.routes['content-api'].routes.push(
        {
            method: "PATCH",
            path: "/user/me",
            handler: "user.updateMe",
            config: {
                prefix: "",
                policies: []
            }
        });
    return plugin;
}