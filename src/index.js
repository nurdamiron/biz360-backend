const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');

const app = express();

// Разрешенные домены
const whitelist = [
  'http://localhost:3000',
  'http://localhost:3030',
  'https://biz360-sepia.vercel.app'
];

// Настройка CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
  credentials: false,
  optionsSuccessStatus: 200
};

// Применяем CORS
app.use(cors(corsOptions));

// Middleware для парсинга JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логгер запросов
const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}]`);
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Origin:', req.headers.origin);
  console.log('------------------------');
  next();
};

app.use(requestLogger);

// Базовые маршруты
app.get('/', (req, res) => {
  res.json({
    status: 'API is running',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        verifyEmail: '/api/auth/verify-email/:token',
        forgotPassword: '/api/auth/forgot-password',
        me: '/api/auth/me',
        logout: '/api/auth/logout',
        refreshToken: '/api/auth/refresh-token'
      }
    }
  });
});

// Проверка состояния сервера
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime()
  });
});

// Подключаем маршруты API
app.use('/api/auth', authRoutes);

// Обработчик ошибок
const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

app.use(errorHandler);

// Обработка несуществующих маршрутов
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server started on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('=================================');
  console.log('Allowed origins:');
  whitelist.forEach(origin => console.log(`- ${origin}`));
  console.log('=================================');
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