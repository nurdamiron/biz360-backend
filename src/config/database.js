const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'root',  // Заменили process.env.DB_NAME на 'root'
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Добавим логирование для отладки
pool.on('connection', (connection) => {
    console.log('New DB connection established');
});

pool.on('error', (err) => {
    console.error('Database error:', err);
});

module.exports = pool;