require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const { connectDB } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const traceIdMiddleware = require('./middleware/traceId');
const loggingMiddleware = require('./middleware/loggingMiddleware');
const logger = require('../src/config/logger'); // Pino instance
const kitchenRoutes=require('./routes/kitchenRoutes')
// Import routes
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- Security Middleware --------------------
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());

// -------------------- Body Parsing Middleware --------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -------------------- Trace ID Middleware --------------------
app.use(traceIdMiddleware);

// -------------------- Logging Middleware --------------------
app.use(loggingMiddleware); // logs requests and responses (masked)

// -------------------- Optional Logging Libraries --------------------
// Uncomment if you want standard HTTP logging
// if (process.env.NODE_ENV === 'development') {
//   app.use(morgan('dev'));
// } else {
//   app.use(morgan('combined'));
// }

// Uncomment to use Pino HTTP logger (note: it will log raw request/response)
// app.use(require('pino-http')({ logger }));

// -------------------- API Routes --------------------
app.use('/api/auth', authRoutes);
app.use('/api/kitchen', kitchenRoutes);
// Add other routes here

// -------------------- Health Check & Root --------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the API',
    version: '1.0.0',
    documentation: '/api/docs'
  });
});

// -------------------- 404 & Error Handling --------------------
app.use(notFound);
app.use(errorHandler);

// -------------------- Start Server --------------------
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
