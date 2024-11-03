const mongoose = require('mongoose');

const earningOpportunitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    address: { type: String, required: true },
    qrCodeLink: { type: String }, // Optional link to QR code image
    currency: { type: String, required: true },
    minDeposit: { type: Number, default: 0 },
    minWithdrawal: { type: Number, default: 0 },
    processingTime: { type: String }, // E.g., "1 week"
    confirmMessage: { type: String, default: "Your request has been submitted and will be processed soon." }
});

module.exports = mongoose.model('EarningOpportunity', earningOpportunitySchema);
