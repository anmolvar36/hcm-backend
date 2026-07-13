const { create, all } = require('mathjs');

// Create a mathjs instance with default configuration
const math = create(all, {
  epsilon: 1e-12,
  matrix: 'Matrix',
  number: 'number',
  precision: 64,
  predictable: false,
  randomSeed: null
});

/**
 * Evaluates a mathematical formula with given variables securely.
 * @param {string} formula - The mathematical expression (e.g., "[Base_Salary] * 0.12").
 *                           Variables should be wrapped in square brackets.
 * @param {object} variables - A key-value mapping of variables (e.g., { "Base_Salary": 5000 }).
 * @returns {number} The calculated result.
 */
const evaluateFormula = (formula, variables) => {
  if (!formula || typeof formula !== 'string') return 0;
  
  let sanitizedFormula = formula;
  const scope = {};

  Object.entries(variables).forEach(([key, value]) => {
    // Sanitize key for mathjs parser
    const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Replace brackets like [Base_Salary] with cleanKey
    // Also replace standalone variables if they exactly match
    // For simplicity, we assume variables in formula are wrapped in brackets like [CTC]
    const regex = new RegExp(`\\[${key}\\]`, 'g');
    sanitizedFormula = sanitizedFormula.replace(regex, cleanKey);
    
    scope[cleanKey] = Number(value) || 0;
  });

  try {
    const result = math.evaluate(sanitizedFormula, scope);
    return isNaN(result) ? 0 : Number(result.toFixed(2));
  } catch (error) {
    console.error(`[Formula Engine Error] Failed to evaluate "${formula}":`, error.message);
    return 0; // Safe fallback
  }
};

module.exports = {
  evaluateFormula
};
