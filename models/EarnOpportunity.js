const mongoose = require('mongoose');

const earnOpportunitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    description: String,
    cryptoTypes: [String]  // List of supported cryptocurrencies
});

module.exports = mongoose.model('EarnOpportunity', earnOpportunitySchema);
