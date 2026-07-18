const prisma = require('../config/prisma');

/**
 * Validates a workflow and its steps before saving to ensure data integrity and prevent logical gaps.
 */
const validateWorkflow = async (workflowData) => {
  const { module, steps } = workflowData;

  if (!module) {
    throw new Error('Workflow must belong to a specific module.');
  }

  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    throw new Error('Workflow must have at least one approval step.');
  }

  // Validate step sequences
  const stepSequences = steps.map(s => s.sequence).sort((a, b) => a - b);
  
  // Check for duplicates
  const uniqueSequences = new Set(stepSequences);
  if (uniqueSequences.size !== stepSequences.length) {
    throw new Error('Workflow steps cannot have duplicate sequences.');
  }

  // Check for gaps (e.g. sequence 1, 2, 4) - Optional depending on strictness
  // For now, we just enforce that sequences are > 0
  if (stepSequences[0] <= 0) {
    throw new Error('Workflow step sequences must be greater than 0.');
  }

  for (const step of steps) {
    if (!step.approverType) {
      throw new Error(`Approver type is missing for step sequence ${step.sequence}.`);
    }
    
    // In Phase 1, we only strictly support ROLE or CUSTOM_ROLE. Others are prepared but might not be fully functional.
    if (!['ROLE', 'CUSTOM_ROLE', 'MANAGER', 'SPECIFIC_USER'].includes(step.approverType)) {
      throw new Error(`Invalid approver type: ${step.approverType} at step sequence ${step.sequence}.`);
    }

    if (!step.approverRole) {
      throw new Error(`Approver role/identifier is missing for step sequence ${step.sequence}.`);
    }
  }

  return true;
};

module.exports = {
  validateWorkflow
};
