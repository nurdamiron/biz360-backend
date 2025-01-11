const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const authController = {
    // Регистрация
    register: async (req, res) => {
        try {
            const { email, password, first_name, last_name } = req.body;

            // Проверка существования email
            const [existingUser] = await pool.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (existingUser.length) {
                return res.status(400).json({ error: 'Email already registered' });
            }

            // Генерация verification token
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(password, 10);

            // Создание пользователя
            const [result] = await pool.execute(
                `INSERT INTO users (email, password, first_name, last_name, verification_token) 
                 VALUES (?, ?, ?, ?, ?)`,
                [email, hashedPassword, first_name, last_name, verificationToken]
            );

            // TODO: Отправка email с подтверждением

            res.status(201).json({
                message: 'Registration successful. Please check your email for verification.',
                userId: result.insertId
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Логин
    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            // Поиск пользователя
            const [users] = await pool.execute(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            const user = users[0];

            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            if (!user.is_verified) {
                return res.status(401).json({ error: 'Please verify your email first' });
            }

            // Создание токенов
            const accessToken = jwt.sign(
                { userId: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            const refreshToken = jwt.sign(
                { userId: user.id },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: '7d' }
            );

            // Сохранение refresh token в базу
            await pool.execute(
                'UPDATE users SET refresh_token = ? WHERE id = ?',
                [refreshToken, user.id]
            );

            res.json({
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Подтверждение email
    verifyEmail: async (req, res) => {
        try {
            const { token } = req.params;

            const [result] = await pool.execute(
                'UPDATE users SET is_verified = true WHERE verification_token = ?',
                [token]
            );

            if (result.affectedRows === 0) {
                return res.status(400).json({ error: 'Invalid verification token' });
            }

            res.json({ message: 'Email verified successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Запрос на сброс пароля
    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 час

            await pool.execute(
                'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
                [resetToken, resetTokenExpiry, email]
            );

            // TODO: Отправка email со ссылкой сброса пароля

            res.json({ message: 'Password reset instructions sent to email' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = authController;