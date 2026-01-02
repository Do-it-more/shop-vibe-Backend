const mongoose = require('mongoose');

const verificationSchema = mongoose.Schema({
    identifier: {
        type: String,
        required: true,
        unique: true
    },
    otp: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        expires: 600
    }
}, {
    timestamps: true
});

// Create TTL index
verificationSchema.index({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Verification', verificationSchema);
