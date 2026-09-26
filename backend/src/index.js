'use strict';

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, () => {
  console.log(`[MergeGuard] Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[MergeGuard] SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[MergeGuard] SIGINT received — shutting down gracefully');
  server.close(() => process.exit(0));
});

module.exports = server;
