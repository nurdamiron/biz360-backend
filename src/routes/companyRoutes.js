const express = require('express');
const router = express.Router();
const companyController = require('../controllers/сompanyController');
const auth = require('../middleware/auth');

router.get('/', auth, companyController.getAllCompanies);
router.post('/', auth, companyController.createCompany);

module.exports = router;