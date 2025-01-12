const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');

const app = express();

// Разрешенные домены
const whitelist = [
  'http://localhost:3000',
  'http://localhost:3030',
  'https://biz360-sepia.vercel.app',
  'https://biz360.vercel.app'
];

// Настройка CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (например, от Postman)
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'Access-Control-Allow-Headers'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400 // Кэширование префлайт запросов на 24 часа
};

// Применяем CORS
app.use(cors(corsOptions));

// Обработка OPTIONS запросов
app.options('*', cors(corsOptions));

// Глобальные middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Добавляем заголовки безопасности
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Логгер запросов
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const { method, url, headers, body } = req;
  
  // Маскируем чувствительные данные
  const sanitizedBody = { ...body };
  if (sanitizedBody.password) sanitizedBody.password = '[HIDDEN]';
  
  console.log('=================================');
  console.log(`[${timestamp}] ${method} ${url}`);
  console.log('Headers:', {
    origin: headers.origin,
    'user-agent': headers['user-agent'],
    'content-type': headers['content-type']
  });
  console.log('Body:', sanitizedBody);
  console.log('=================================');
  
  // Добавляем timestamp к запросу для измерения времени выполнения
  req.requestTime = Date.now();
  
  // Логируем время выполнения запроса
  res.on('finish', () => {
    const duration = Date.now() - req.requestTime;
    console.log(`[${timestamp}] ${method} ${url} completed in ${duration}ms`);
  });

  next();
};

app.use(requestLogger);

// Базовые маршруты
app.get('/', (req, res) => {
  res.json({
    status: 'API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        verifyEmail: '/api/auth/verify/:token',
        forgotPassword: '/api/auth/forgot-password',
        resetPassword: '/api/auth/reset-password',
        me: '/api/auth/me',
        logout: '/api/auth/logout',
        refreshToken: '/api/auth/refresh-token'
      }
    }
  });
});

// Мониторинг состояния
app.get('/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  };

  res.status(200).json(healthData);
});

// API маршруты
app.use('/api/auth', authRoutes);

// Централизованный обработчик ошибок
const errorHandler = (err, req, res, next) => {
  // Логируем ошибку
  console.error('Error:', {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    origin: req.headers.origin,
    error: {
      message: err.message,
      status: err.status,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }
  });

  // Определяем статус ошибки
  const statusCode = err.status || err.statusCode || 500;

  // Формируем ответ
  const errorResponse = {
    error: err.message || 'Internal Server Error',
    status: statusCode,
    path: req.path,
    timestamp: new Date().toISOString()
  };

  // Добавляем stack trace только в development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
};

app.use(errorHandler);

// Обработка несуществующих маршрутов
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      auth: '/api/auth',
      health: '/health'
    }
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server started on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('=================================');
  console.log('Allowed origins:');
  whitelist.forEach(origin => console.log(`- ${origin}`));
  console.log('=================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

// Обработка необработанных ошибок
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Даем время на логирование ошибки перед выходом
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

module.exports = app;