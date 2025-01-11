const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Middleware для валидации
const validateRequest = require('../middleware/validateRequest');

// Auth routes
router.post('/register', 
  validateRequest(['email', 'password', 'first_name', 'last_name']), 
  authController.register
);

router.post('/login', 
  validateRequest(['email', 'password']), 
  authController.login
);

router.get('/verify-email/:token', authController.verifyEmail);

router.post('/forgot-password', 
  validateRequest(['email']), 
  authController.forgotPassword
);

module.exports = router;