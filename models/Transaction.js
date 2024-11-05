const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to the User
    type: { type: String, enum: ['deposit', 'withdrawal'], required: true }, // Transaction type
    currency: { type: String, required: true }, // Currency type, e.g., 'TON', 'BTC'
    amount: { type: Number, required: true }, // Amount for the transaction
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }, // Status of the transaction
    createdAt: { type: Date, default: Date.now }, // Transaction creation date
    updatedAt: { type: Date, default: Date.now }, // Last update date (for status changes)
    memo: { type: String }, // Unique memo for deposits, based on userId
});

module.exports = mongoose.model('Transaction', transactionSchema);
