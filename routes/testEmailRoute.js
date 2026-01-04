const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

router.get('/', async (req, res) => {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailUser || !emailPass) {
        return res.status(500).json({
            error: "Credentials missing",
            emailUser: emailUser ? "Set" : "Missing",
            emailPass: emailPass ? "Set" : "Missing"
        });
    }

    // Resend API Integration
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
        const data = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: (process.env.EMAIL_USER || 'delivered@resend.dev'), // Send to self or Resend test email
            subject: "Test Email from Render (via Resend)",
            html: "<p>If you see this, <strong>Resend API</strong> is WORKING on Render!</p>"
        });

        res.json({ message: "Email sent successfully! Check your inbox.", data });
    } catch (error) {
        console.error("Resend Error:", error);
        res.status(500).json({
            message: "Failed to send email",
            error: error.message
        });
    }
});

module.exports = router;
