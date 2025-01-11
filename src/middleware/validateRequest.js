const validateRequest = (requiredFields) => {
    return (req, res, next) => {
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: 'Missing required fields',
          fields: missingFields
        });
      }
      
      next();
    };
  };
  
  module.exports = validateRequest;