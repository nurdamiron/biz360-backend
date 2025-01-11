const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', auth, authController.logout);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/forgot-password', authController.forgotPassword);

// Защищенный маршрут для проверки
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
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;