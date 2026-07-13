const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getOrgId = async (user) => {
  if (user && user.organizationId) return user.organizationId;
  const defaultOrg = await prisma.organization.findFirst({ select: { id: true } });
  if (!defaultOrg) throw new Error("No organization found in the system.");
  return defaultOrg.id;
};

exports.getSalaryStructures = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const structures = await prisma.salaryStructure.findMany({
      where: { organizationId: orgId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });
    res.json(structures);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSalaryStructureById = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const structure = await prisma.salaryStructure.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: {
            components: {
              include: { component: true },
              orderBy: { sequence: 'asc' }
            }
          }
        }
      }
    });
    if (!structure) return res.status(404).json({ message: 'Structure not found' });
    res.json(structure);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createSalaryStructure = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const { name, description, country, state, currency, isDefault, components } = req.body;
    
    if (isDefault) {
      await prisma.salaryStructure.updateMany({
        where: { organizationId: orgId, isDefault: true },
        data: { isDefault: false }
      });
    }

    // Validate components if provided
    let dbComponents = [];
    if (components && Array.isArray(components) && components.length > 0) {
      dbComponents = await prisma.salaryComponent.findMany({
        where: { id: { in: components.map(c => c.componentId) } }
      });
      // Optionally check for Auto Balance here, but not blocking.
    }

    const structure = await prisma.$transaction(async (tx) => {
      // 1. Create Structure
      const struct = await tx.salaryStructure.create({
        data: {
          organizationId: orgId,
          name,
          description,
          country,
          state,
          currency: currency || "USD",
          isDefault: isDefault || false,
          versions: {
            create: {
              version: 1,
              effectiveFrom: new Date()
            }
          }
        },
        include: { versions: true }
      });

      const versionId = struct.versions[0].id;

      // 2. Create Structure Components
      for (const reqComp of components) {
        const dbComp = dbComponents.find(c => c.id === reqComp.componentId);
        if (!dbComp) continue;

        await tx.salaryStructureComponent.create({
          data: {
            versionId,
            componentId: reqComp.componentId,
            sequence: reqComp.sequence || 1,
            category: dbComp.category,
            calculationType: dbComp.calculationType,
            calculationBase: dbComp.calculationBase,
            value: dbComp.value,
            formula: dbComp.formula
          }
        });
      }

      // 3. Set current version
      await tx.salaryStructure.update({
        where: { id: struct.id },
        data: { currentVersionId: versionId }
      });

      return struct;
    });

    res.status(201).json(structure);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateSalaryStructure = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const { name, description, status, isDefault } = req.body;

    const existing = await prisma.salaryStructure.findFirst({
      where: { id: req.params.id, organizationId: orgId }
    });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    if (isDefault) {
      await prisma.salaryStructure.updateMany({
        where: { organizationId: orgId, isDefault: true, id: { not: req.params.id } },
        data: { isDefault: false }
      });
    }

    const updated = await prisma.salaryStructure.update({
      where: { id: req.params.id },
      data: { name, description, status, isDefault }
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteSalaryStructure = async (req, res) => {
  try {
    await prisma.salaryStructure.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateStructureVersionComponents = async (req, res) => {
  try {
    const orgId = await getOrgId(req.user);
    const { id, versionId } = req.params;
    const { components } = req.body;

    const structure = await prisma.salaryStructure.findFirst({
      where: { id, organizationId: orgId }
    });
    if (!structure) return res.status(404).json({ message: 'Not found' });

    let autoBalanceCount = 0;
    let maxSequence = 0;
    const componentCodes = [];
    
    for (const comp of components) {
      const baseComp = await prisma.salaryComponent.findUnique({ where: { id: comp.componentId } });
      if (!baseComp) return res.status(400).json({ message: "Invalid component ID: " });
      if (baseComp.isAutoBalance || comp.calculationType === 'Auto Balance') {
        autoBalanceCount++;
      }
      if (comp.sequence > maxSequence) {
        maxSequence = comp.sequence;
      }
      componentCodes.push(baseComp.code);
    }

    if (autoBalanceCount !== 1) {
      return res.status(400).json({ message: 'Exactly one Auto Balance component must exist in the structure.' });
    }
    
    const uniqueCodes = new Set(componentCodes);
    if (uniqueCodes.size !== componentCodes.length) {
      return res.status(400).json({ message: 'Component codes must be unique within the structure.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.salaryStructureComponent.deleteMany({
        where: { versionId }
      });

      for (const comp of components) {
        await tx.salaryStructureComponent.create({
          data: {
            versionId,
            componentId: comp.componentId,
            sequence: comp.sequence,
            category: comp.category,
            calculationType: comp.calculationType,
            calculationBase: comp.calculationBase,
            value: comp.value,
            formula: comp.formula
          }
        });
      }
    });

    res.json({ message: 'Components updated successfully.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
