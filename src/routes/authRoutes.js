const express = require('express');
const router = express.Router();
const pool = require('../config/database');  // Добавляем импорт pool
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Основные маршруты аутентификации
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/forgot-password', authController.forgotPassword);

// Маршруты управления токенами
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', auth, authController.logout);

// Защищенный маршрут для получения данных пользователя
router.get('/me', auth, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, email, first_name, last_name FROM users WHERE id = ?',
            [req.user.userId]
        );
        
        if (!users.length) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(users[0]);
    } catch (error) {
        console.error('Error in /me route:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;