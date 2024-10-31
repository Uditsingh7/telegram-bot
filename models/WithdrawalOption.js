// models/WithdrawalOption.js
const mongoose = require('mongoose');

const withdrawalOptionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    description: String
});

module.exports = mongoose.model('WithdrawalOption', withdrawalOptionSchema);
