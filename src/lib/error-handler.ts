// Global error handler to prevent uncaught exceptions from crashing the application

export function setupGlobalErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Stack trace:', error.stack);
    
    // Don't exit the process, just log the error
    // In production, you might want to restart the process
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    // Don't exit the process, just log the error
  });

  // Handle SIGTERM gracefully
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  // Handle SIGINT gracefully
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}

// Export a function to initialize error handlers
export function initializeErrorHandling() {
  setupGlobalErrorHandlers();
}
