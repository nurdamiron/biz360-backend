const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/emailService');

// Utility functions
const generateTokens = (userId, email) => {
    const accessToken = jwt.sign(
        { userId, email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
};

const authController = {
    // Registration
    register: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const { email, password, first_name, last_name } = req.body;

            if (!email || !password) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Email и пароль обязательны' 
                });
            }

            // Check existing user
            const [existingUser] = await connection.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (existingUser.length) {
                await connection.rollback();
                return res.status(400).json({ 
                    success: false,
                    error: 'Этот email уже зарегистрирован' 
                });
            }

            // Generate verification token and hash password
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create user
            const [result] = await connection.execute(
                `INSERT INTO users (
                    email, password, first_name, last_name, 
                    verification_token, is_verified, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())`,
                [email, hashedPassword, first_name, last_name, verificationToken]
            );

            await connection.commit();

            // Send verification email
            try {
                await sendVerificationEmail(email, verificationToken);
                console.log('Verification email sent to:', email);
            } catch (emailError) {
                console.error('Error sending verification email:', emailError);
            }

            res.status(201).json({
                success: true,
                message: 'Регистрация успешна. Проверьте email для подтверждения.',
                userId: result.insertId
            });

        } catch (error) {
            await connection.rollback();
            console.error('Registration error:', error);
            res.status(500).json({ 
                success: false,
                error: 'Ошибка при регистрации. Попробуйте позже.' 
            });
        } finally {
            connection.release();
        }
    },

    // Login
    login: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Email и пароль обязательны' 
                });
            }

            const [users] = await connection.execute(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            const user = users[0];

            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ 
                    success: false,
                    error: 'Неверный email или пароль' 
                });
            }

            if (!user.is_verified) {
                return res.status(401).json({
                    success: false,
                    error: 'Пожалуйста, подтвердите ваш email'
                });
            }

            const { accessToken, refreshToken } = generateTokens(user.id, user.email);

            await connection.execute(
                'UPDATE users SET refresh_token = ?, updated_at = NOW() WHERE id = ?',
                [refreshToken, user.id]
            );

            res.json({
                success: true,
                access: accessToken,
                refresh: refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка входа. Попробуйте позже.'
            });
        } finally {
            connection.release();
        }
    },

    // Email verification
    verifyEmail: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { token } = req.params;
            console.log('Verifying email with token:', token);

            if (!token) {
                return res.status(400).json({
                    success: false,
                    error: 'Токен верификации отсутствует'
                });
            }

            const [users] = await connection.execute(
                'SELECT id, is_verified FROM users WHERE verification_token = ?',
                [token]
            );

            if (!users.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Неверный или истекший токен верификации'
                });
            }

            if (users[0].is_verified) {
                return res.status(400).json({
                    success: false,
                    error: 'Email уже подтвержден'
                });
            }

            await connection.execute(
                `UPDATE users 
                 SET is_verified = 1,
                     verification_token = NULL,
                     updated_at = NOW()
                 WHERE id = ?`,
                [users[0].id]
            );

            await connection.commit();

            res.json({
                success: true,
                message: 'Email успешно подтвержден! Теперь вы можете войти в систему.'
            });

        } catch (error) {
            await connection.rollback();
            console.error('Email verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка при подтверждении email. Попробуйте позже.'
            });
        } finally {
            connection.release();
        }
    },

    // Token refresh
    refreshToken: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { refresh } = req.body;

            if (!refresh) {
                return res.status(400).json({
                    success: false,
                    error: 'Refresh token обязателен'
                });
            }

            const decoded = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET);
            
            const [users] = await connection.execute(
                'SELECT * FROM users WHERE id = ? AND refresh_token = ?',
                [decoded.userId, refresh]
            );

            if (!users.length) {
                return res.status(401).json({
                    success: false,
                    error: 'Недействительный refresh token'
                });
            }

            const user = users[0];
            const { accessToken, refreshToken } = generateTokens(user.id, user.email);

            await connection.execute(
                'UPDATE users SET refresh_token = ?, updated_at = NOW() WHERE id = ?',
                [refreshToken, user.id]
            );

            res.json({
                success: true,
                access: accessToken,
                refresh: refreshToken
            });

        } catch (error) {
            console.error('Token refresh error:', error);
            res.status(401).json({
                success: false,
                error: 'Ошибка обновления токена'
            });
        } finally {
            connection.release();
        }
    },

    // Logout
    logout: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.execute(
                'UPDATE users SET refresh_token = NULL, updated_at = NOW() WHERE id = ?',
                [req.user.userId]
            );
            
            res.json({
                success: true,
                message: 'Выход выполнен успешно'
            });
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка при выходе'
            });
        } finally {
            connection.release();
        }
    },

    // Get user info
    getMe: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const [users] = await connection.execute(
                'SELECT id, email, first_name, last_name, is_verified FROM users WHERE id = ?',
                [req.user.userId]
            );

            if (!users.length) {
                return res.status(404).json({
                    success: false,
                    error: 'Пользователь не найден'
                });
            }

            res.json({
                success: true,
                user: users[0]
            });
        } catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка получения данных пользователя'
            });
        } finally {
            connection.release();
        }
    }
};

module.exports = authController;