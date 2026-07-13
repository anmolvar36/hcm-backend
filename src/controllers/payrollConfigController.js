const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getOrgId = async (user) => {
  if (user.organizationId) return user.organizationId;
  const defaultOrg = await prisma.organization.findFirst({ select: { id: true } });
  if (!defaultOrg) throw new Error("No organization found in the system.");
  return defaultOrg.id;
};

// ==========================================
// Salary Components
// ==========================================
exports.getSalaryComponents = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const components = await prisma.salaryComponent.findMany({
      where: { organizationId: orgId },
      orderBy: { displayOrder: 'asc' }
    });
    res.json(components);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createSalaryComponent = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const { 
      name, code, category, calculationType, calculationBase, 
      value, formula, sequence, isTaxable, isAutoBalance, 
      isEmployerContribution, isEmployeeDeduction, roundingRule, displayOrder 
    } = req.body;
    
    // Auto Balance validation
    if (isAutoBalance) {
      const existing = await prisma.salaryComponent.findFirst({
        where: { organizationId: orgId, isAutoBalance: true }
      });
      if (existing) {
        return res.status(400).json({ message: "Only one Auto Balance component is allowed per organization." });
      }
    }

    const finalEmployerContribution = category === 'Employer Contribution';
    const finalEmployeeDeduction = category === 'Deduction';

    const component = await prisma.salaryComponent.create({
      data: {
        organizationId: orgId,
        name,
        code,
        category,
        calculationType,
        calculationBase,
        value: String(value || "0"),
        formula,
        sequence: Number(sequence || 0),
        isTaxable,
        isAutoBalance,
        isEmployerContribution: finalEmployerContribution,
        isEmployeeDeduction: finalEmployeeDeduction,
        roundingRule: roundingRule || "Nearest",
        displayOrder: Number(displayOrder || 0),
        status: "Active"
      }
    });res.status(201).json(component);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateSalaryComponent = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const component = await prisma.salaryComponent.findFirst({
      where: { id: req.params.id, organizationId: orgId }
    });
    if (!component) return res.status(404).json({ message: 'Not found' });

    if (req.body.isAutoBalance) {
      const existing = await prisma.salaryComponent.findFirst({
        where: { organizationId: orgId, isAutoBalance: true, id: { not: req.params.id } }
      });
      if (existing) {
        return res.status(400).json({ message: "Only one Auto Balance component is allowed per organization." });
      }
    }

    if (req.body.value !== undefined) req.body.value = String(req.body.value);
    if (req.body.sequence !== undefined) req.body.sequence = Number(req.body.sequence);

    const updated = await prisma.salaryComponent.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteSalaryComponent = async (req, res) => {
  try {
    await prisma.salaryComponent.delete({
      where: { id: req.params.id } // Prisma throws if missing
    });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ==========================================
// Deduction Rules
// ==========================================
exports.getDeductions = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const deductions = await prisma.deductionRule.findMany({
      where: { organizationId: orgId }
    });
    res.json(deductions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createDeduction = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const data = { ...req.body, organizationId: orgId };
    const deduction = await prisma.deductionRule.create({ data });
    res.status(201).json(deduction);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteDeduction = async (req, res) => {
  try {
    await prisma.deductionRule.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ==========================================
// Tax Rules
// ==========================================
exports.getTaxRules = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const taxes = await prisma.taxRule.findMany({
      where: { organizationId: orgId }
    });
    res.json(taxes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createTaxRule = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const data = { ...req.body, organizationId: orgId };
    const tax = await prisma.taxRule.create({ data });
    res.status(201).json(tax);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteTaxRule = async (req, res) => {
  try {
    await prisma.taxRule.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ==========================================
// Approval Workflows
// ==========================================
exports.getWorkflows = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const workflows = await prisma.approvalWorkflow.findMany({
      where: { organizationId: orgId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } }
    });
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createWorkflow = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const { name, module, steps } = req.body;
    const workflow = await prisma.approvalWorkflow.create({
      data: {
        organizationId: orgId,
        name,
        module,
        steps: {
          create: steps // Expects array: [{ stepOrder: 1, approverRole: 'MANAGER' }]
        }
      },
      include: { steps: true }
    });
    res.status(201).json(workflow);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
