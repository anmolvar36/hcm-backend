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
  candidates: {
    fullName: { required: true, type: 'string' },
    email: { required: true, type: 'email' }
  },
  benefits: {
    name: { required: true, type: 'string' },
    category: { required: true, type: 'string' },
    contribution: { required: true, type: 'string' },
    provider: { required: true, type: 'string' },
    eligibility: { required: true, type: 'string' },
    status: { required: true, type: 'string' }
  },
  leave: {
    userId: { required: true, type: 'string' },
    startDate: { required: true, type: 'string' }
  },
  attendance: {
    userId: { required: true, type: 'string' },
    date: { required: true, type: 'string' }
  },
  payroll: {
    employeeId: { required: true, type: 'string' },
    month: { required: true, type: 'string' }
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
      if (rule.required && (value === undefined || value === null || String(value).trim() === '')) {
        isRowValid = false;
        errors.push({
          row: rowNumber,
          column: field,
          error: `Required field '${field}' is missing or empty`
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
