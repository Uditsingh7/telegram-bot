// ecosystem.config.js
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

module.exports = {
    apps: [
        {
            name: 'vect-dev',
            script: './src/server.js',
            env: {
                TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
                BOT_USERNAME: process.env.BOT_USERNAME,
                MONGODB_URI: process.env.MONGODB_URI

            },
            instances: 1, // Use 1 instance; can be adjusted later
            exec_mode: 'fork', // or 'cluster'
        },
    ],
};
