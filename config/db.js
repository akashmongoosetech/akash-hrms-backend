const mongoose = require('mongoose');

const RETRY_DELAY_MS = 5000;

const connectDB = async (mongoUri) => {
  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));

  // A failed initial connect must not kill the process. On Render an exiting
  // app is restarted, and the restart never finishes booting, so every request
  // turns into a 502 with no CORS headers (which browsers report as a CORS
  // error). Retry with a fixed delay and let /api/health report the real state.
  for (;;) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
      console.log('MongoDB connected');
      return;
    } catch (err) {
      console.error('MongoDB connection failed:', err.message);
      console.error('Retrying in 5s. Check MONGO_URI and the Atlas IP allowlist.');
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

module.exports = connectDB;
