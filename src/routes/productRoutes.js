const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const auth = require('../middleware/auth'); // Если требуется защита

// Получить список всех продуктов
router.get('/list', productController.getProducts);

// Получить детали конкретного продукта
router.get('/details/:id', productController.getProductDetails);

// Добавить новый продукт
router.post('/', auth, productController.createProduct);

// Обновить продукт
router.put('/:id', auth, productController.updateProduct);

// Удалить продукт
router.delete('/:id', auth, productController.deleteProduct);

// Поиск продуктов
router.get('/search', productController.searchProducts);

module.exports = router;
