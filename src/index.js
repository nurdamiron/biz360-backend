const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/auth', authRoutes);

// app.use('/api/metrics', require('./routes/metricsRoutes'));
// app.use('/api/sales', require('./routes/salesRoutes'));
// app.use('/api/auth', require('./routes/authRoutes'));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});