const pool = require('../config/database');

const companyController = {
    getAllCompanies: async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM companies');
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    createCompany: async (req, res) => {
        try {
            const { name, industry } = req.body;
            const [result] = await pool.execute(
                'INSERT INTO companies (name, industry) VALUES (?, ?)',
                [name, industry]
            );
            res.status(201).json({ id: result.insertId, name, industry });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = companyController;