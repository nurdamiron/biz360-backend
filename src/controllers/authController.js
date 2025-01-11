const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const authController = {
    // Регистрация
    register: async (req, res) => {
        try {
            console.log('Starting registration process...');
            const { email, password, first_name, last_name } = req.body;
            console.log('Received data:', { email, first_name, last_name });
    
            // Проверка существования email
            console.log('Checking if email exists...');
            const [existingUser] = await pool.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );
            console.log('Existing user check result:', existingUser);
    
            if (existingUser.length) {
                console.log('Email already exists');
                return res.status(400).json({ error: 'Email already registered' });
            }
    
            console.log('Generating tokens...');
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(password, 10);
    
            console.log('Creating user...');
            const [result] = await pool.execute(
                `INSERT INTO users (email, password, first_name, last_name, verification_token) 
                 VALUES (?, ?, ?, ?, ?)`,
                [email, hashedPassword, first_name, last_name, verificationToken]
            );
    
            console.log('User created successfully');
            res.status(201).json({
                message: 'Registration successful. Please check your email for verification.',
                userId: result.insertId
            });
        } catch (error) {
            console.error('Registration error:', error);
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

    refreshToken: async (req, res) => {
        try {
            const { refresh_token } = req.body;
            
            if (!refresh_token) {
                return res.status(400).json({ error: 'Refresh token required' });
            }

            const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
            
            const [users] = await pool.execute(
                'SELECT * FROM users WHERE id = ? AND refresh_token = ?',
                [decoded.userId, refresh_token]
            );

            if (!users.length) {
                return res.status(401).json({ error: 'Invalid refresh token' });
            }

            const user = users[0];

            const accessToken = jwt.sign(
                { userId: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            const newRefreshToken = jwt.sign(
                { userId: user.id },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: '7d' }
            );

            await pool.execute(
                'UPDATE users SET refresh_token = ? WHERE id = ?',
                [newRefreshToken, user.id]
            );

            res.json({
                accessToken,
                refreshToken: newRefreshToken
            });
        } catch (error) {
            res.status(401).json({ error: 'Invalid refresh token' });
        }
    },

    logout: async (req, res) => {
        try {
            await pool.execute(
                'UPDATE users SET refresh_token = NULL WHERE id = ?',
                [req.user.userId]
            );
            
            res.json({ message: 'Logged out successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // Добавим метод сброса пароля
    resetPassword: async (req, res) => {
        try {
            const { token, newPassword } = req.body;

            const [users] = await pool.execute(
                'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
                [token]
            );

            if (!users.length) {
                return res.status(400).json({ error: 'Invalid or expired reset token' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            await pool.execute(
                'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
                [hashedPassword, users[0].id]
            );

            res.json({ message: 'Password reset successful' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getMe: async (req, res) => {
        try {
            const [users] = await pool.execute(
                'SELECT id, email, first_name, last_name, is_verified FROM users WHERE id = ?',
                [req.user.userId]
            );

            if (!users.length) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json(users[0]);
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