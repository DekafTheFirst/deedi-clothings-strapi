module.exports = {
    async beforeCreate(event) {
        const { data } = event.params;
        // console.log('Before Create Data:', data);

        if (!data.product) {
            throw new Error('Product is required');
        }

        // Optionally log for debugging
    },
};
