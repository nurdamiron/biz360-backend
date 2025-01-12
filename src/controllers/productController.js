const pool = require('../config/database');

// Получить список всех продуктов
exports.getProducts = async (req, res) => {
  try {
    const [products] = await pool.query('SELECT * FROM products');
    res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

// Получить детали конкретного продукта
exports.getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const [product] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);

    if (!product.length) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json({ product: product[0] });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
};

// Добавить новый продукт
exports.createProduct = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { name, description, price, stock, category, colors, gender } = req.body;

    if (!name || !price || !stock) {
      return res.status(400).json({ error: 'Name, price, and stock are required' });
    }

    const [result] = await connection.execute(
      'INSERT INTO products (name, description, price, stock, category, colors, gender) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description, price, stock, category, JSON.stringify(colors), JSON.stringify(gender)]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Product created successfully',
      productId: result.insertId,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  } finally {
    connection.release();
  }
};

// Обновить существующий продукт
exports.updateProduct = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { name, description, price, stock, category, colors, gender } = req.body;

    const [result] = await connection.execute(
      'UPDATE products SET name = ?, description = ?, price = ?, stock = ?, category = ?, colors = ?, gender = ? WHERE id = ?',
      [name, description, price, stock, category, JSON.stringify(colors), JSON.stringify(gender), id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }

    await connection.commit();

    res.status(200).json({ message: 'Product updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  } finally {
    connection.release();
  }
};

// Удалить продукт
exports.deleteProduct = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [result] = await connection.execute('DELETE FROM products WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }

    await connection.commit();

    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  } finally {
    connection.release();
  }
};

// Поиск продуктов
exports.searchProducts = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchQuery = `%${query}%`; // SQL шаблон для поиска
    const [products] = await pool.query(
      'SELECT * FROM products WHERE name LIKE ? OR description LIKE ?',
      [searchQuery, searchQuery]
    );

    res.status(200).json({ products });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
};
