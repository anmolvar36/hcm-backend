const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// @desc    Get all overtime policies
// @route   GET /api/admin/overtime-policies
// @access  Admin, SuperAdmin
const getOvertimePolicies = async (req, res) => {
  try {
    const policies = await prisma.overtimePolicy.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(policies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error fetching overtime policies' });
  }
};

// @desc    Create overtime policy
// @route   POST /api/admin/overtime-policies
// @access  Admin, SuperAdmin
const createOvertimePolicy = async (req, res) => {
  try {
    const { name, minMinutesForOT, rateMultiplier, isDefault, weekdayMultiplier, weekendMultiplier, holidayMultiplier, minOvertimeMin, maxOvertimeMin } = req.body;
    
    if (isDefault) {
      await prisma.overtimePolicy.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    const policy = await prisma.overtimePolicy.create({
      data: {
        name,
        minOvertimeMin: parseInt(minOvertimeMin || minMinutesForOT) || 30,
        maxOvertimeMin: parseInt(maxOvertimeMin) || 240,
        weekdayMultiplier: parseFloat(weekdayMultiplier || rateMultiplier) || 1.5,
        weekendMultiplier: parseFloat(weekendMultiplier || rateMultiplier) || 2.0,
        holidayMultiplier: parseFloat(holidayMultiplier || rateMultiplier) || 2.0,
        isDefault: Boolean(isDefault)
      }
    });
    res.status(201).json(policy);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error creating overtime policy' });
  }
};

// @desc    Update overtime policy
// @route   PUT /api/admin/overtime-policies/:id
// @access  Admin, SuperAdmin
const updateOvertimePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, minMinutesForOT, rateMultiplier, isDefault, weekdayMultiplier, weekendMultiplier, holidayMultiplier, minOvertimeMin, maxOvertimeMin } = req.body;
    
    if (isDefault) {
      await prisma.overtimePolicy.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }

    const policy = await prisma.overtimePolicy.update({
      where: { id },
      data: {
        name,
        minOvertimeMin: parseInt(minOvertimeMin || minMinutesForOT) || 30,
        maxOvertimeMin: parseInt(maxOvertimeMin) || 240,
        weekdayMultiplier: parseFloat(weekdayMultiplier || rateMultiplier) || 1.5,
        weekendMultiplier: parseFloat(weekendMultiplier || rateMultiplier) || 2.0,
        holidayMultiplier: parseFloat(holidayMultiplier || rateMultiplier) || 2.0,
        isDefault: Boolean(isDefault)
      }
    });
    res.json(policy);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error updating overtime policy' });
  }
};

// @desc    Delete overtime policy
// @route   DELETE /api/admin/overtime-policies/:id
// @access  Admin, SuperAdmin
const deleteOvertimePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.overtimePolicy.delete({ where: { id } });
    res.json({ message: 'Overtime policy deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error deleting overtime policy' });
  }
};

module.exports = {
  getOvertimePolicies,
  createOvertimePolicy,
  updateOvertimePolicy,
  deleteOvertimePolicy
};
