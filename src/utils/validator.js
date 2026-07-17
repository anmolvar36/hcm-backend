/**
 * Generic Validation Engine for Imports
 */

// Simple email regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Add entity specific validation rules
const validationRules = {
  users: {
    email: { required: true, type: 'email' },
    role: { required: true, type: 'string' }
  },
  employees: {
    employeeId: { required: true, type: 'string' },
    fullName: { required: true, type: 'string' },
    email: { required: true, type: 'email' },
    department: { required: false, type: 'string' } // Will be foreign key validated later if needed
  },
  jobs: {
    title: { required: true, type: 'string' }
  }
};

/**
 * Validates mapped data array against entity rules
 * 
 * @param {Array<Object>} mappedData 
 * @param {String} entity 
 * @returns {Object} - { validRows: Array, invalidRows: Array, errors: Array }
 */
const validateData = (mappedData, entity) => {
  const rules = validationRules[entity] || {};
  
  const validRows = [];
  const invalidRows = [];
  const errors = []; // { row: number, column: string, error: string }

  mappedData.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for 0-index, +1 for header row in Excel
    let isRowValid = true;

    // Check rules
    Object.keys(rules).forEach(field => {
      const rule = rules[field];
      const value = row[field];

      // Required check
      if (rule.required && (!value || String(value).trim() === '')) {
        isRowValid = false;
        errors.push({
          row: rowNumber,
          column: field,
          error: 'Required field is missing'
        });
      }

      // Type check (Email)
      if (value && rule.type === 'email') {
        if (!emailRegex.test(String(value).trim())) {
          isRowValid = false;
          errors.push({
            row: rowNumber,
            column: field,
            error: 'Invalid Email Format'
          });
        }
      }
      
      // Date validations, Numeric validations can be added here...
    });

    if (isRowValid) {
      validRows.push(row);
    } else {
      invalidRows.push(row);
    }
  });

  return {
    validRows,
    invalidRows,
    errors
  };
};

module.exports = {
  validateData,
  validationRules
};
