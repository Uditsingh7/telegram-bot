// models/Referral.js
const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    referrerId: { type: String, required: true }, // userId of the referrer
    referredUserId: { type: String, required: true, unique: true },
    rewarded: { type: Boolean, default: false }, // Flag to check if points were awarded
});

module.exports = mongoose.model('Referral', referralSchema);
