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
      res.json({
        ...product,
        images: JSON.parse(product.images || '[]'),
        tags: JSON.parse(product.tags || '[]'),
        gender: JSON.parse(product.gender || '[]'),
        colors: JSON.parse(product.colors || '[]'),
        sizes: JSON.parse(product.sizes || '[]'),
        new_label: JSON.parse(product.new_label || 'null'),
        sale_label: JSON.parse(product.sale_label || 'null')
      });
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
  
      const [result] = await db.query(
        `INSERT INTO products (
          name,
          description,
          sub_description,
          code,
          sku,
          price,
          price_sale,
          quantity,
          taxes,
          images,
          colors,
          sizes,
          tags,
          gender,
          category,
          new_label,
          sale_label,
          is_published
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          description,
          sub_description || null,
          code,
          sku,
          parseFloat(price),
          price_sale ? parseFloat(price_sale) : null,
          parseInt(quantity),
          taxes ? parseFloat(taxes) : null,
          JSON.stringify([]),  // пустой массив для images
          JSON.stringify(colors || []),
          JSON.stringify(sizes || []),
          JSON.stringify(tags || []),
          JSON.stringify(gender || []),
          category || null,
          JSON.stringify(new_label || null),
          JSON.stringify(sale_label || null),
          is_published ? 1 : 0  // преобразуем в 0/1 для tinyint
        ]
      );
  
      // Получаем созданный продукт
      const [newProduct] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [result.insertId]
      );
  
      // Возвращаем ответ с обработанными JSON полями
      res.status(201).json({
        ...newProduct[0],
        images: JSON.parse(newProduct[0].images || '[]'),
        colors: JSON.parse(newProduct[0].colors || '[]'),
        sizes: JSON.parse(newProduct[0].sizes || '[]'),
        tags: JSON.parse(newProduct[0].tags || '[]'),
        gender: JSON.parse(newProduct[0].gender || '[]'),
        new_label: JSON.parse(newProduct[0].new_label || 'null'),
        sale_label: JSON.parse(newProduct[0].sale_label || 'null'),
        is_published: Boolean(newProduct[0].is_published)
      });
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