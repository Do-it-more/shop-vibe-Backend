const admin = require('firebase-admin');

// Ensure you have your serviceAccountKey.json in the Backend/config folder or ENV variables
// For production, use environment variables to construct the object or path
// We will try to parse from ENV string or file

const initializeFirebaseAdmin = () => {
    try {
        if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
            console.warn("⚠️  FIREBASE_SERVICE_ACCOUNT not found in .env. Phone verification backend check will fail.");
            return;
        }

        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("🔥 Firebase Admin Initialized");
        }
    } catch (error) {
        console.error("❌ Firebase Admin Initialization Failed:", error.message);
    }
};

module.exports = { admin, initializeFirebaseAdmin };
