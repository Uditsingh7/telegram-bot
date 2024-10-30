const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    withdrawalDetails: {
        exchangeId: String,
        cryptoAddress: String,
        bankDetails: String,
    },
    completedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
});

module.exports = mongoose.model('User', userSchema);
