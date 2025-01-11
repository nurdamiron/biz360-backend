const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middleware
app.use(cors({
 origin: ['http://localhost:3000', 'https://biz360-sepia.vercel.app'],
 credentials: true,
 methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
 allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Body:', req.body);
  next();
});

// Базовый маршрут
app.get('/', (req, res) => {
 res.json({
   message: 'Welcome to Biz360 API',
   version: '1.0',
   endpoints: {
     auth: {
       register: '/api/auth/register',
       login: '/api/auth/login',
       verifyEmail: '/api/auth/verify-email/:token',
       forgotPassword: '/api/auth/forgot-password'
     },
     protected: {
       me: '/api/auth/me',
       logout: '/api/auth/logout',
       refreshToken: '/api/auth/refresh-token'
     }
   }
 });
});

// Health check
app.get('/health', (req, res) => {
 res.status(200).json({ 
   status: 'ok',
   timestamp: new Date(),
   environment: process.env.NODE_ENV
 });
});

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/companies', require('./routes/companyRoutes'));

// Обработка ошибок
app.use((err, req, res, next) => {
 console.error(`Error [${new Date().toISOString()}]:`, {
   message: err.message,
   stack: err.stack,
   path: req.path,
   method: req.method
 });

 res.status(err.status || 500).json({
   error: err.message || 'Internal Server Error',
   stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
 });
});

// Обработка несуществующих маршрутов
app.use('*', (req, res) => {
 console.log(`[${new Date().toISOString()}] 404 - Route not found: ${req.method} ${req.originalUrl}`);
 res.status(404).json({ 
   error: 'Route not found',
   requestedPath: req.originalUrl
 });
});

const PORT = process.env.PORT || 3000;

// Запуск сервера
app.listen(PORT, () => {
 console.log(`Server started at ${new Date().toISOString()}`);
 console.log(`Server running on port ${PORT}`);
 console.log(`Environment: ${process.env.NODE_ENV}`);
 console.log('Available endpoints:');
 console.log('- GET  /');
 console.log('- GET  /health');
 console.log('- POST /api/auth/register');
 console.log('- POST /api/auth/login');
 console.log('- GET  /api/auth/verify-email/:token');
 console.log('- POST /api/auth/forgot-password');
});

// Обработка необработанных ошибок
process.on('unhandledRejection', (error) => {
 console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
 console.error('Uncaught Exception:', error);
 process.exit(1);
});