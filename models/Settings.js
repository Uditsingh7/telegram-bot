const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed }  // Allows for text, URLs, or numbers
});

module.exports = mongoose.model('Settings', settingsSchema);
