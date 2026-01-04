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

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: emailUser,
            pass: emailPass
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    try {
        await transporter.verify(); // Check connection first

        await transporter.sendMail({
            from: emailUser,
            to: emailUser, // Send to self
            subject: "Test Email from Render",
            text: "If you see this, email sending is WORKING!"
        });

        res.json({ message: "Email sent successfully! Check your inbox." });
    } catch (error) {
        console.error("Test Email Error:", error);
        res.status(500).json({
            message: "Failed to send email",
            error: error.message,
            stack: error.stack,
            code: error.code,
            command: error.command
        });
    }
});

module.exports = router;
