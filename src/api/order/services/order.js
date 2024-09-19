'use strict';

/**
 * order service
 */

const sgMail = require('@sendgrid/mail');

// Set your API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY); // Or hardcode the key if needed (not recommended)

const sendEmail = async (to, subject, htmlContent) => {
    const msg = {
        to, // recipient's email address
        from: 'your-email@example.com', // verified SendGrid sender email
        subject,
        html: htmlContent, // HTML content of the email
    };

    try {
        await sgMail.send(msg);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        if (error.response) {
            console.error(error.response.body);
        }
    }
};

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::order.order', ({ strapi }) => ({

}));
