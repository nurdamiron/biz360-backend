// controllers/productController.js
const db = require('../config/database');

const productController = {
  async getProducts(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      
      // Защита от SQL-инъекций для сортировки
      const allowedSortFields = ['created_at', 'name', 'price', 'quantity'];
      const sort = allowedSortFields.includes(req.query.sort) ? req.query.sort : 'created_at';
      const order = req.query.order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      const [products] = await db.query(
        `SELECT SQL_CALC_FOUND_ROWS * FROM products ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      const [[{ total }]] = await db.query('SELECT FOUND_ROWS() as total');

      const processedProducts = products.map(product => ({
        ...product,
        images: JSON.parse(product.images || '[]'),
        tags: JSON.parse(product.tags || '[]'),
        gender: JSON.parse(product.gender || '[]'),
        colors: JSON.parse(product.colors || '[]'),
        sizes: JSON.parse(product.sizes || '[]'),
        new_label: JSON.parse(product.new_label || 'null'),
        sale_label: JSON.parse(product.sale_label || 'null')
      }));

      res.json({
        products: processedProducts,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error in getProducts:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  },

  async getProductById(req, res) {
    try {
      const [products] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [req.params.id]
      );
  
      if (products.length === 0) {
        return res.status(404).json({ 
          error: 'Product not found',
          message: `Product with id ${req.params.id} does not exist` 
        });
      }
  
      const product = products[0];
  
      // Безопасный парсинг JSON с проверкой на null и undefined
      const safeParseJSON = (jsonString, defaultValue = []) => {
        if (!jsonString) return defaultValue;
        try {
          return JSON.parse(jsonString);
        } catch (e) {
          console.error('JSON parse error:', e);
          return defaultValue;
        }
      };
  
      // Обработка данных перед отправкой
      const processedProduct = {
        ...product,
        images: safeParseJSON(product.images, []),
        colors: safeParseJSON(product.colors, []),
        sizes: safeParseJSON(product.sizes, []),
        tags: safeParseJSON(product.tags, []),
        gender: safeParseJSON(product.gender, []),
        new_label: safeParseJSON(product.new_label, null),
        sale_label: safeParseJSON(product.sale_label, null),
        is_published: Boolean(product.is_published),
        // Преобразование числовых полей
        price: parseFloat(product.price),
        price_sale: product.price_sale ? parseFloat(product.price_sale) : null,
        quantity: parseInt(product.quantity),
        taxes: product.taxes ? parseFloat(product.taxes) : null
      };
  
      res.json(processedProduct);
    } catch (error) {
      console.error('Error in getProductById:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  },

  async createProduct(req, res) {
    try {
      const {
        name,
        description,
        sub_description,
        code,
        sku,
        price,
        price_sale,
        quantity,
        taxes,
        colors,
        sizes,
        tags,
        gender,
        category,
        new_label,
        sale_label,
        is_published
      } = req.body;
  
      // Проверка уникальности code и sku
      const [existing] = await db.query(
        'SELECT id FROM products WHERE code = ? OR sku = ?',
        [code, sku]
      );
  
      if (existing.length > 0) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Product with this code or SKU already exists'
        });
      }
  
      // Подготовка данных для вставки
      const insertData = {
        name,
        description,
        sub_description: sub_description || null,
        code,
        sku,
        price: parseFloat(price),
        price_sale: price_sale ? parseFloat(price_sale) : null,
        quantity: parseInt(quantity),
        taxes: taxes ? parseFloat(taxes) : null,
        images: JSON.stringify([]),
        colors: JSON.stringify(colors || []),
        sizes: JSON.stringify(sizes || []),
        tags: JSON.stringify(tags || []),
        gender: JSON.stringify(gender || []),
        category: category || null,
        new_label: new_label ? JSON.stringify(new_label) : null,
        sale_label: sale_label ? JSON.stringify(sale_label) : null,
        is_published: is_published ? 1 : 0
      };
  
      // Создание SQL запроса динамически
      const fields = Object.keys(insertData).join(', ');
      const placeholders = Object.keys(insertData).map(() => '?').join(', ');
      const values = Object.values(insertData);
  
      const [result] = await db.query(
        `INSERT INTO products (${fields}) VALUES (${placeholders})`,
        values
      );
  
      // Получение созданного продукта
      const [newProduct] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [result.insertId]
      );
  
      // Безопасный парсинг JSON
      const safeParseJSON = (jsonString, defaultValue = []) => {
        if (!jsonString) return defaultValue;
        try {
          return JSON.parse(jsonString);
        } catch (e) {
          console.error('JSON parse error:', e);
          return defaultValue;
        }
      };
  
      // Обработка данных перед отправкой
      const processedProduct = {
        ...newProduct[0],
        images: safeParseJSON(newProduct[0].images, []),
        colors: safeParseJSON(newProduct[0].colors, []),
        sizes: safeParseJSON(newProduct[0].sizes, []),
        tags: safeParseJSON(newProduct[0].tags, []),
        gender: safeParseJSON(newProduct[0].gender, []),
        new_label: safeParseJSON(newProduct[0].new_label, null),
        sale_label: safeParseJSON(newProduct[0].sale_label, null),
        is_published: Boolean(newProduct[0].is_published),
        price: parseFloat(newProduct[0].price),
        price_sale: newProduct[0].price_sale ? parseFloat(newProduct[0].price_sale) : null,
        quantity: parseInt(newProduct[0].quantity),
        taxes: newProduct[0].taxes ? parseFloat(newProduct[0].taxes) : null
      };
  
      res.status(201).json(processedProduct);
    } catch (error) {
      console.error('Error in createProduct:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  },

  async updateProduct(req, res) {
    try {
      const {
        name,
        description,
        sub_description,
        code,
        sku,
        price,
        price_sale,
        quantity,
        taxes,
        colors,
        sizes,
        tags,
        gender,
        category,
        new_label,
        sale_label,
        is_published
      } = req.body;

      // Проверка существования продукта
      const [existingProduct] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [req.params.id]
      );

      if (existingProduct.length === 0) {
        return res.status(404).json({ 
          error: 'Product not found',
          message: `Product with id ${req.params.id} does not exist`
        });
      }

      // Проверка уникальности code и sku для других продуктов
      const [duplicates] = await db.query(
        'SELECT id FROM products WHERE (code = ? OR sku = ?) AND id != ?',
        [code, sku, req.params.id]
      );

      if (duplicates.length > 0) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Product with this code or SKU already exists'
        });
      }

      if (!name || !description || !code || !sku || !price || !quantity) {
        return res.status(400).json({
          error: 'Missing required fields',
          fields: ['name', 'description', 'code', 'sku', 'price', 'quantity'].filter(
            field => !req.body[field]
          )
        });
      }

      // Обработка изображений
      let images = existingProduct[0].images;
      if (req.files?.length > 0) {
        images = JSON.stringify(req.files.map(file => ({
          url: `/uploads/${file.filename}` // Добавлен leading slash
        })));
      }

      await db.query(
        `UPDATE products SET
          name = ?, description = ?, sub_description = ?, images = ?,
          code = ?, sku = ?, price = ?, price_sale = ?, quantity = ?,
          taxes = ?, colors = ?, sizes = ?, tags = ?, gender = ?,
          category = ?, new_label = ?, sale_label = ?, is_published = ?
        WHERE id = ?`,
        [
          name,
          description,
          sub_description || null,
          images,
          code,
          sku,
          parseFloat(price),
          price_sale ? parseFloat(price_sale) : null,
          parseInt(quantity),
          taxes ? parseFloat(taxes) : null,
          colors || '[]',
          sizes || '[]',
          tags || '[]',
          gender || '[]',
          category || null,
          new_label || null,
          sale_label || null,
          is_published === true || is_published === 'true',
          req.params.id
        ]
      );

      const [updatedProduct] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [req.params.id]
      );

      res.json({
        ...updatedProduct[0],
        images: JSON.parse(updatedProduct[0].images || '[]'),
        tags: JSON.parse(updatedProduct[0].tags || '[]'),
        gender: JSON.parse(updatedProduct[0].gender || '[]'),
        colors: JSON.parse(updatedProduct[0].colors || '[]'),
        sizes: JSON.parse(updatedProduct[0].sizes || '[]'),
        new_label: JSON.parse(updatedProduct[0].new_label || 'null'),
        sale_label: JSON.parse(updatedProduct[0].sale_label || 'null')
      });
    } catch (error) {
      console.error('Error in updateProduct:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  },

  async deleteProduct(req, res) {
    try {
      const [result] = await db.query(
        'DELETE FROM products WHERE id = ?',
        [req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          error: 'Product not found',
          message: `Product with id ${req.params.id} does not exist`
        });
      }

      res.json({ 
        message: 'Product deleted successfully',
        id: req.params.id
      });
    } catch (error) {
      console.error('Error in deleteProduct:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  },

  async searchProducts(req, res) {
    try {
      const { query } = req.query;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const searchQuery = `%${query}%`;

      const [products] = await db.query(
        `SELECT SQL_CALC_FOUND_ROWS * FROM products 
         WHERE name LIKE ? OR description LIKE ? OR code LIKE ? OR sku LIKE ?
         LIMIT ? OFFSET ?`,
        [searchQuery, searchQuery, searchQuery, searchQuery, limit, offset]
      );

      const [[{ total }]] = await db.query('SELECT FOUND_ROWS() as total');

      res.json({
        products: products.map(product => ({
          ...product,
          images: JSON.parse(product.images || '[]'),
          tags: JSON.parse(product.tags || '[]'),
          gender: JSON.parse(product.gender || '[]'),
          colors: JSON.parse(product.colors || '[]'),
          sizes: JSON.parse(product.sizes || '[]'),
          new_label: JSON.parse(product.new_label || 'null'),
          sale_label: JSON.parse(product.sale_label || 'null')
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error in searchProducts:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  }
};

module.exports = productController;