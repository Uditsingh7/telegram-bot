const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 0 }, // General balance for referrals, tasks, etc.
    cryptoBalances: { // New field to store currency-specific balances
        type: Map,
        of: Number, // Each key-value pair stores a currency and its respective balance
        default: {} // Initialize as an empty object
    },
    referrals: { type: Number, default: 0 },
    username: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    withdrawalDetails: {
        exchangeId: String,
        cryptoAddress: String,
        bankDetails: String,
    },
    completedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    role: { type: String, default: 'user', enum: ['user', 'admin'] },
});

module.exports = mongoose.model('User', userSchema);
