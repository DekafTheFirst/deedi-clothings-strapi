module.exports = {
    async beforeCreate(event) {
        const { data } = event.params;
        if (!data.product) {
            throw new Error('Product is required');
        }
    },
    async beforeUpdate(event) {
        const { data } = event.params;
        if (data && !data.product) {
            throw new Error('Product is required');
        }
    },
};