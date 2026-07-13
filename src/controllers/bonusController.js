const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getBonuses = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const bonuses = await prisma.bonus.findMany({
      where: { employeeId },
      orderBy: { effectiveMonth: 'desc' }
    });
    res.json(bonuses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.grantBonus = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { amount, reason, type, isTaxable, effectiveMonth } = req.body;
    
    const bonus = await prisma.bonus.create({
      data: {
        employeeId,
        amount,
        reason,
        type,
        isTaxable,
        effectiveMonth,
        status: 'Approved' // HR grants directly
      }
    });
    res.status(201).json(bonus);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
