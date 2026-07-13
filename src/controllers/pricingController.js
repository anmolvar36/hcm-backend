const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/pricing
// Fetch all active pricing plans (or all if ?all=true and user is superadmin)
const getPricingPlans = async (req, res, next) => {
  try {
    const showAll = req.query.all === 'true';
    
    // We only allow all=true if user is superadmin, but for simplicity let's check it:
    // If not superadmin, showAll is false.
    let whereClause = { isActive: true };
    if (showAll) {
      whereClause = {};
    }

    const plans = await prisma.pricingPlan.findMany({
      where: whereClause,
      include: {
        features: {
          orderBy: { displayOrder: 'asc' }
        }
      },
      orderBy: { displayOrder: 'asc' }
    });

    // If database is empty, seed initial plans so page is not blank
    if (plans.length === 0 && !showAll) {
      const seededPlans = await seedDefaultPlans();
      return res.status(200).json({ success: true, data: seededPlans });
    }

    return res.status(200).json({ success: true, data: plans });
  } catch (err) {
    next(err);
  }
};

// Helper to seed default plans
const seedDefaultPlans = async () => {
  const plansData = [
    {
      name: "Starter",
      description: "Essential HR tools for small growing teams.",
      monthlyPrice: 15,
      yearlyPrice: 144,
      currency: "USD",
      billingCycle: "Both",
      trialDays: 14,
      maxEmployees: 15,
      maxAdmins: 2,
      storageLimit: 5,
      aiCredits: 50,
      supportLevel: "Email Support",
      buttonText: "Start Free Trial",
      buttonLink: "/login",
      isPopular: false,
      isActive: true,
      displayOrder: 1,
    },
    {
      name: "Professional",
      description: "Advanced automation & analytics for scaling firms.",
      monthlyPrice: 39,
      yearlyPrice: 372,
      currency: "USD",
      billingCycle: "Both",
      trialDays: 14,
      maxEmployees: 100,
      maxAdmins: 5,
      storageLimit: 25,
      aiCredits: 500,
      supportLevel: "Priority 24/7 Support",
      buttonText: "Get Professional",
      buttonLink: "/login",
      isPopular: true,
      isActive: true,
      displayOrder: 2,
    },
    {
      name: "Enterprise",
      description: "Tailored security, unlimited scaling, and full features.",
      monthlyPrice: 99,
      yearlyPrice: 948,
      currency: "USD",
      billingCycle: "Both",
      trialDays: 30,
      maxEmployees: 9999,
      maxAdmins: 99,
      storageLimit: 500,
      aiCredits: 5000,
      supportLevel: "Dedicated Account Manager",
      buttonText: "Contact Enterprise",
      buttonLink: "/book-demo",
      isPopular: false,
      isActive: true,
      displayOrder: 3,
    }
  ];

  const features = {
    Starter: ["Employee Self Service", "Core Directory & Attendance", "Document Storage (5GB)", "Email Support"],
    Professional: ["AI Recruitment assistant", "Automated Payroll processing", "KPI & Performance Tracking", "Priority 24/7 Support", "API & Webhook Integrations"],
    Enterprise: ["Custom Workflow Automation", "Biometric/Clock-in Synced Logs", "Dedicated Account Manager", "Unlimited AI Screen credits", "HIPAA/SOC2 Security Suite"]
  };

  const createdPlans = [];
  for (const p of plansData) {
    const plan = await prisma.pricingPlan.create({
      data: {
        ...p,
        features: {
          create: features[p.name].map((f, index) => ({
            feature: f,
            displayOrder: index
          }))
        }
      },
      include: {
        features: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    });
    createdPlans.push(plan);
  }
  return createdPlans;
};

// GET /api/pricing/:id
const getPricingPlanById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await prisma.pricingPlan.findUnique({
      where: { id },
      include: {
        features: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    });

    if (!plan) {
      return res.status(404).json({ success: false, error: { message: "Pricing plan not found." } });
    }

    return res.status(200).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
};

// POST /api/pricing
// SuperAdmin Only
const createPricingPlan = async (req, res, next) => {
  try {
    const {
      name,
      description,
      monthlyPrice,
      yearlyPrice,
      currency,
      billingCycle,
      trialDays,
      maxEmployees,
      maxAdmins,
      storageLimit,
      aiCredits,
      supportLevel,
      buttonText,
      buttonLink,
      isPopular,
      isActive,
      displayOrder,
      features
    } = req.body;

    // Validations
    if (!name) return res.status(400).json({ success: false, error: { message: "Plan Name is required." } });
    if (monthlyPrice === undefined || monthlyPrice < 0) return res.status(400).json({ success: false, error: { message: "Valid Monthly Price is required." } });
    if (yearlyPrice === undefined || yearlyPrice < 0) return res.status(400).json({ success: false, error: { message: "Valid Yearly Price is required." } });

    // Check duplicate name
    const existing = await prisma.pricingPlan.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ success: false, error: { message: "A pricing plan with this name already exists." } });
    }

    const plan = await prisma.pricingPlan.create({
      data: {
        name,
        description: description || "",
        monthlyPrice: parseFloat(monthlyPrice),
        yearlyPrice: parseFloat(yearlyPrice),
        currency: currency || "USD",
        billingCycle: billingCycle || "Monthly",
        trialDays: parseInt(trialDays) || 0,
        maxEmployees: parseInt(maxEmployees) || 0,
        maxAdmins: parseInt(maxAdmins) || 0,
        storageLimit: parseInt(storageLimit) || 0,
        aiCredits: aiCredits !== undefined ? parseInt(aiCredits) : 0,
        supportLevel: supportLevel || "Standard",
        buttonText: buttonText || "Get Started",
        buttonLink: buttonLink || "/login",
        isPopular: !!isPopular,
        isActive: isActive !== undefined ? !!isActive : true,
        displayOrder: parseInt(displayOrder) || 0,
        features: {
          create: (features || []).map((f, index) => ({
            feature: typeof f === 'string' ? f : f.feature,
            displayOrder: f.displayOrder !== undefined ? parseInt(f.displayOrder) : index
          }))
        }
      },
      include: {
        features: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    });

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'CREATE_PRICING_PLAN',
          details: `Created pricing plan: ${plan.name}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    return res.status(201).json({ success: true, data: plan, message: "Pricing plan created successfully." });
  } catch (err) {
    next(err);
  }
};

// PUT /api/pricing/:id
// SuperAdmin Only
const updatePricingPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      monthlyPrice,
      yearlyPrice,
      currency,
      billingCycle,
      trialDays,
      maxEmployees,
      maxAdmins,
      storageLimit,
      aiCredits,
      supportLevel,
      buttonText,
      buttonLink,
      isPopular,
      isActive,
      displayOrder,
      features
    } = req.body;

    const existingPlan = await prisma.pricingPlan.findUnique({ where: { id } });
    if (!existingPlan) {
      return res.status(404).json({ success: false, error: { message: "Pricing plan not found." } });
    }

    // Name duplicate check
    if (name && name !== existingPlan.name) {
      const duplicate = await prisma.pricingPlan.findUnique({ where: { name } });
      if (duplicate) {
        return res.status(400).json({ success: false, error: { message: "A pricing plan with this name already exists." } });
      }
    }

    // Update using transaction to ensure features deletion and recreation is atomic
    const updatedPlan = await prisma.$transaction(async (tx) => {
      // Delete old features
      await tx.pricingFeature.deleteMany({ where: { pricingPlanId: id } });

      // Update plan details and add new features
      return await tx.pricingPlan.update({
        where: { id },
        data: {
          name: name !== undefined ? name : existingPlan.name,
          description: description !== undefined ? description : existingPlan.description,
          monthlyPrice: monthlyPrice !== undefined ? parseFloat(monthlyPrice) : existingPlan.monthlyPrice,
          yearlyPrice: yearlyPrice !== undefined ? parseFloat(yearlyPrice) : existingPlan.yearlyPrice,
          currency: currency !== undefined ? currency : existingPlan.currency,
          billingCycle: billingCycle !== undefined ? billingCycle : existingPlan.billingCycle,
          trialDays: trialDays !== undefined ? parseInt(trialDays) : existingPlan.trialDays,
          maxEmployees: maxEmployees !== undefined ? parseInt(maxEmployees) : existingPlan.maxEmployees,
          maxAdmins: maxAdmins !== undefined ? parseInt(maxAdmins) : existingPlan.maxAdmins,
          storageLimit: storageLimit !== undefined ? parseInt(storageLimit) : existingPlan.storageLimit,
          aiCredits: aiCredits !== undefined ? parseInt(aiCredits) : existingPlan.aiCredits,
          supportLevel: supportLevel !== undefined ? supportLevel : existingPlan.supportLevel,
          buttonText: buttonText !== undefined ? buttonText : existingPlan.buttonText,
          buttonLink: buttonLink !== undefined ? buttonLink : existingPlan.buttonLink,
          isPopular: isPopular !== undefined ? !!isPopular : existingPlan.isPopular,
          isActive: isActive !== undefined ? !!isActive : existingPlan.isActive,
          displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : existingPlan.displayOrder,
          features: {
            create: (features || []).map((f, index) => ({
              feature: typeof f === 'string' ? f : f.feature,
              displayOrder: f.displayOrder !== undefined ? parseInt(f.displayOrder) : index
            }))
          }
        },
        include: {
          features: {
            orderBy: { displayOrder: 'asc' }
          }
        }
      });
    });

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE_PRICING_PLAN',
          details: `Updated pricing plan: ${updatedPlan.name}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    return res.status(200).json({ success: true, data: updatedPlan, message: "Pricing plan updated successfully." });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/pricing/:id
// SuperAdmin Only
const deletePricingPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await prisma.pricingPlan.findUnique({ where: { id } });
    if (!plan) {
      return res.status(404).json({ success: false, error: { message: "Pricing plan not found." } });
    }

    await prisma.pricingPlan.delete({ where: { id } });

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'DELETE_PRICING_PLAN',
          details: `Deleted pricing plan: ${plan.name}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    return res.status(200).json({ success: true, message: "Pricing plan deleted successfully." });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pricing/:id/status
// SuperAdmin Only
const togglePricingPlanStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await prisma.pricingPlan.findUnique({ where: { id } });
    if (!plan) {
      return res.status(404).json({ success: false, error: { message: "Pricing plan not found." } });
    }

    const updated = await prisma.pricingPlan.update({
      where: { id },
      data: { isActive: !plan.isActive }
    });

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: updated.isActive ? 'ACTIVATE_PRICING_PLAN' : 'DEACTIVATE_PRICING_PLAN',
          details: `${updated.isActive ? 'Activated' : 'Deactivated'} pricing plan: ${plan.name}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    return res.status(200).json({ success: true, data: updated, message: `Pricing plan ${updated.isActive ? 'activated' : 'deactivated'} successfully.` });
  } catch (err) {
    next(err);
  }
};

// PUT /api/pricing/reorder
// SuperAdmin Only
const reorderPricingPlans = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: { message: "Array of plan IDs is required." } });
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.pricingPlan.update({
          where: { id },
          data: { displayOrder: index }
        })
      )
    );

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'REORDER_PRICING_PLANS',
          details: `Reordered pricing plans list`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    return res.status(200).json({ success: true, message: "Pricing plans reordered successfully." });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPricingPlans,
  getPricingPlanById,
  createPricingPlan,
  updatePricingPlan,
  deletePricingPlan,
  togglePricingPlanStatus,
  reorderPricingPlans
};
