const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // Mongoose 6+ defaults these to true, but explicitly stating them for clarity if using older versions or specific setups
            // useNewUrlParser: true,  // Deprecated in recent Mongoose versions but often requested for legacy
            // useUnifiedTopology: true // Deprecated in recent Mongoose versions but often requested for legacy
        });

        console.log(`MongoDB Atlas Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
