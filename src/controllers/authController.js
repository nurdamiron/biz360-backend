const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

// Вспомогательные функции
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

const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

const generateRandomToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

const authController = {
    // Регистрация пользователя
    register: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const { email, password, first_name, last_name } = req.body;
            console.log('Получены данные:', { email, first_name, last_name });
    
            // Валидация
            if (!email || !password) {
                return res.status(400).json({ 
                    error: 'Email и пароль обязательны' 
                });
            }
    
            // Проверка существования email
            const [existingUser] = await connection.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );
    
            if (existingUser.length) {
                return res.status(400).json({ 
                    error: 'Этот email уже зарегистрирован' 
                });
            }
    
            // Генерация токена и хеширование пароля
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(password, 10);
    
            // Создание пользователя
            const [result] = await connection.execute(
                `INSERT INTO users (
                    email, 
                    password, 
                    first_name, 
                    last_name, 
                    verification_token,
                    is_verified
                ) VALUES (?, ?, ?, ?, ?, false)`,
                [email, hashedPassword, first_name, last_name, verificationToken]
            );
    
            await connection.commit();
    
            // Отправка email для верификации
            try {
                await sendVerificationEmail(email, verificationToken);
            } catch (emailError) {
                console.error('Ошибка отправки email:', emailError);
                // Продолжаем выполнение, даже если email не отправился
            }
    
            res.status(201).json({
                message: 'Регистрация успешна. Проверьте email для подтверждения.',
                userId: result.insertId
            });
    
        } catch (error) {
            await connection.rollback();
            console.error('Ошибка регистрации:', error);
            
            res.status(500).json({ 
                error: 'Ошибка при регистрации. Попробуйте позже.' 
            });
        } finally {
            connection.release();
        }
    },

    // Вход в систему
    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ 
                    error: 'Email and password are required' 
                });
            }

            // Поиск пользователя
            const [users] = await pool.execute(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            const user = users[0];

            // Проверка пользователя и пароля
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ 
                    error: 'Invalid credentials' 
                });
            }

            // Проверка верификации email
            if (!user.is_verified) {
                return res.status(401).json({ 
                    error: 'Please verify your email first' 
                });
            }

            // Генерация токенов
            const { accessToken, refreshToken } = generateTokens(user.id, user.email);

            // Сохранение refresh token
            await pool.execute(
                'UPDATE users SET refresh_token = ? WHERE id = ?',
                [refreshToken, user.id]
            );

            res.json({
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
                error: 'Login failed. Please try again.' 
            });
        }
    },


    verifyEmail: async (req, res) => {
        try {
            const { token } = req.params;
            console.log('Получен токен для верификации:', token);
    
            // Устанавливаем заголовки
            res.setHeader('Content-Type', 'application/json');
    
            if (!token) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Токен верификации отсутствует' 
                });
            }
    
            // Поиск пользователя
            const [users] = await pool.execute(
                'SELECT id, is_verified FROM users WHERE verification_token = ?',
                [token]
            );
            console.log('Найден пользователь:', users[0]);
    
            if (!users.length) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Неверный токен верификации' 
                });
            }
    
            // Обновление статуса
            await pool.execute(
                `UPDATE users 
                 SET is_verified = 1, 
                     verification_token = NULL,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [users[0].id]
            );
    
            // Проверяем обновление
            const [updatedUser] = await pool.execute(
                'SELECT is_verified FROM users WHERE id = ?',
                [users[0].id]
            );
    
            if (!updatedUser[0] || updatedUser[0].is_verified !== 1) {
                throw new Error('Не удалось обновить статус верификации');
            }
    
            return res.status(200).json({
                success: true,
                message: 'Email успешно подтвержден! Теперь вы можете войти в систему.'
            });
    
        } catch (error) {
            console.error('Ошибка верификации:', error);
            return res.status(500).json({
                success: false,
                error: 'Не удалось подтвердить email. Пожалуйста, попробуйте позже.'
            });
        }
    },

    
    // Обновление токена
    refreshToken: async (req, res) => {
        try {
            const { refresh } = req.body;

            if (!refresh) {
                return res.status(400).json({ 
                    error: 'Refresh token is required' 
                });
            }

            // Верификация refresh токена
            const decoded = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET);

            // Проверка токена в базе
            const [users] = await pool.execute(
                'SELECT * FROM users WHERE id = ? AND refresh_token = ?',
                [decoded.userId, refresh]
            );

            if (!users.length) {
                return res.status(401).json({ 
                    error: 'Invalid refresh token' 
                });
            }

            const user = users[0];

            // Генерация новых токенов
            const { accessToken, refreshToken } = generateTokens(user.id, user.email);

            // Обновление refresh токена
            await pool.execute(
                'UPDATE users SET refresh_token = ? WHERE id = ?',
                [refreshToken, user.id]
            );

            res.json({
                access: accessToken,
                refresh: refreshToken
            });
        } catch (error) {
            console.error('Token refresh error:', error);
            res.status(401).json({ 
                error: 'Invalid refresh token' 
            });
        }
    },

    // Выход из системы
    logout: async (req, res) => {
        try {
            await pool.execute(
                'UPDATE users SET refresh_token = NULL WHERE id = ?',
                [req.user.userId]
            );
            
            res.json({ 
                message: 'Logged out successfully' 
            });
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({ 
                error: 'Logout failed. Please try again.' 
            });
        }
    },

    // Запрос на сброс пароля
    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ 
                    error: 'Email is required' 
                });
            }

            // Проверка существования пользователя
            const [users] = await pool.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (!users.length) {
                return res.status(404).json({ 
                    error: 'User not found' 
                });
            }

            const resetToken = generateRandomToken();
            const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 час

            await pool.execute(
                'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
                [resetToken, resetTokenExpiry, email]
            );

            // Отправка email для сброса пароля
            await sendPasswordResetEmail(email, resetToken);

            res.json({ 
                message: 'Password reset instructions sent to email' 
            });
        } catch (error) {
            console.error('Password reset request error:', error);
            res.status(500).json({ 
                error: 'Failed to process password reset request' 
            });
        }
    },

    // Сброс пароля
    resetPassword: async (req, res) => {
        try {
            const { token, newPassword } = req.body;

            if (!token || !newPassword) {
                return res.status(400).json({ 
                    error: 'Token and new password are required' 
                });
            }

            // Проверка токена
            const [users] = await pool.execute(
                'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
                [token]
            );

            if (!users.length) {
                return res.status(400).json({ 
                    error: 'Invalid or expired reset token' 
                });
            }

            // Обновление пароля
            const hashedPassword = await hashPassword(newPassword);
            await pool.execute(
                'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
                [hashedPassword, users[0].id]
            );

            res.json({ 
                message: 'Password reset successful' 
            });
        } catch (error) {
            console.error('Password reset error:', error);
            res.status(500).json({ 
                error: 'Failed to reset password' 
            });
        }
    },

    // Получение данных пользователя
    getMe: async (req, res) => {
        try {
            const [users] = await pool.execute(
                'SELECT id, email, first_name, last_name, is_verified FROM users WHERE id = ?',
                [req.user.userId]
            );

            if (!users.length) {
                return res.status(404).json({ 
                    error: 'User not found' 
                });
            }

            res.json(users[0]);
        } catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({ 
                error: 'Failed to retrieve user data' 
            });
        }
    }
};

module.exports = authController;