const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { initiateApproval } = require('../services/approvalWorkflowService');
const { generatePayrollSnapshot } = require('../services/payrollEngineService');

// ==========================================
// Compensation Profiles
// ==========================================
exports.getCompensationProfile = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const profile = await prisma.compensationProfile.findUnique({
      where: { employeeId },
      include: { salaryBand: true, salaryStructure: true, employee: true }
    });
    if (!profile) return res.status(404).json({ message: "No compensation profile found." });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCompensationProfile = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { baseSalary, monthlyCTC, annualCTC, salaryBandId, salaryStructureId, salaryVersionId, effectiveDate, reason } = req.body;

    // Get existing to create version
    const existing = await prisma.compensationProfile.findUnique({ where: { employeeId } });

    if (existing) {
      const prevSal = existing.monthlyCTC || existing.baseSalary || 0;
      const newSal = monthlyCTC || baseSalary || 0;
      
      await prisma.compensationVersion.create({
        data: {
          employee: { connect: { id: employeeId } },
          previousSalary: prevSal,
          newSalary: newSal,
          difference: newSal - prevSal,
          reason: reason || "Standard Update",
          effectiveDate: new Date(effectiveDate || Date.now()),
          version: existing.version || 1
        }
      });
    }

    const cleanStructureId = salaryStructureId === '' ? null : salaryStructureId;
    const cleanVersionId = salaryVersionId === '' ? null : salaryVersionId;
    const cleanBandId = salaryBandId === '' ? null : salaryBandId;

    const calculatedAnnualCTC = monthlyCTC ? (Number(monthlyCTC) * 12) : 0;

    const updated = await prisma.compensationProfile.upsert({
      where: { employeeId },
      update: {
        baseSalary,
        monthlyCTC,
        annualCTC: calculatedAnnualCTC,
        salaryBandId: cleanBandId,
        salaryStructureId: cleanStructureId,
        salaryVersionId: cleanVersionId,
        effectiveDate: new Date(effectiveDate || Date.now()),
        version: existing ? existing.version + 1 : 1
      },
      create: {
        employeeId,
        baseSalary,
        monthlyCTC,
        annualCTC: calculatedAnnualCTC,
        salaryBandId: cleanBandId,
        salaryStructureId: cleanStructureId,
        salaryVersionId: cleanVersionId,
        effectiveDate: new Date(effectiveDate || Date.now())
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ==========================================
// Salary Increment Requests
// ==========================================
exports.requestIncrement = async (req, res) => {
  try {
    const { requestedSalary, reason, effectiveDate } = req.body;
    const employeeId = req.user.employeeProfileId; // Assuming middleware sets this
    if (!employeeId) return res.status(400).json({ message: "Employee profile not found for user." });

    const request = await prisma.salaryIncrementRequest.create({
      data: {
        employeeId,
        requestedSalary,
        reason,
        effectiveDate: new Date(effectiveDate)
      }
    });

    // Try to initiate workflow
    try {
      const { workflow } = await initiateApproval(req.user.organizationId, 'SalaryIncrement', request.id, employeeId);
      await prisma.salaryIncrementRequest.update({
        where: { id: request.id },
        data: { workflowId: workflow.id }
      });
    } catch (wfError) {
      console.warn("Workflow not initiated:", wfError.message);
    }

    // ── Notify the employee's manager about the new increment request ──
    try {
      const { createNotification } = require('../utils/notificationHelper');
      const empProfile = await prisma.employeeProfile.findUnique({
        where: { id: employeeId },
        include: { manager: true }
      });
      if (empProfile && empProfile.manager?.userId) {
        await createNotification({
          userId: empProfile.manager.userId,
          title: 'Salary Increment Request',
          message: `${empProfile.fullName} has requested a salary increment of ₹${Number(requestedSalary).toLocaleString()}. Reason: ${reason || 'Not specified'}.`,
          type: 'WARNING',
          link: '/manager/compensation'
        });
      }
    } catch (notifErr) {
      console.error('Failed to send increment request notification:', notifErr);
    }

    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ==========================================
// Payroll Snapshot Generation (Trigger)
// ==========================================
exports.runPayroll = async (req, res) => {
  try {
    const { employeeId, month } = req.body;
    const snapshot = await generatePayrollSnapshot(employeeId, month, req.user.organizationId);
    res.status(201).json(snapshot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.runPayrollBatch = async (req, res) => {
  try {
    const { employeeIds, month } = req.body;
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: "employeeIds array is required" });
    }
    
    const snapshots = [];
    const errors = [];
    
    // Process concurrently (we could use Promise.allSettled)
    const results = await Promise.allSettled(
      employeeIds.map(id => generatePayrollSnapshot(id, month, req.user.organizationId))
    );
    
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        snapshots.push(result.value);
      } else {
        errors.push({ employeeId: employeeIds[idx], error: result.reason.message });
      }
    });

    res.status(201).json({ snapshots, errors });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getPayrollSnapshots = async (req, res) => {
  try {
    // If employee, only their own. If HR/Admin, all for org.
    const whereClause = req.user.role === 'EMPLOYEE'
      ? { employee: { userId: req.user.userId } }
      : { employee: { user: { organizationId: req.user.organizationId } } };

    if (req.query.month) whereClause.month = req.query.month;

    const snapshots = await prisma.payrollSnapshot.findMany({
      where: whereClause,
      include: { 
        items: true, 
        employee: { 
          select: { 
            fullName: true, 
            employeeId: true,
            avatarUrl: true
          } 
        } 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.finalizePayrollSnapshot = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.payrollSnapshot.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Payroll snapshot not found" });
    }
    if (existing.status !== 'Draft') {
      return res.status(400).json({ message: `Snapshot is already ${existing.status}` });
    }

    const updated = await prisma.payrollSnapshot.update({
      where: { id },
      data: {
        status: 'Paid',
        paymentDate: new Date()
      }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getHRIncrementRequests = async (req, res) => {
  try {
    const requests = await prisma.salaryIncrementRequest.findMany({
      where: {
        status: 'ManagerApproved',
        employee: {
          user: {
            organizationId: req.user.organizationId
          }
        }
      },
      include: {
        employee: {
          select: {
            fullName: true,
            employeeId: true,
            avatarUrl: true,
            compensationProfile: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.approveHRIncrementRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.salaryIncrementRequest.findFirst({
      where: {
        id,
        employee: {
          user: {
            organizationId: req.user.organizationId
          }
        }
      },
      include: { employee: true }
    });

    if (!request) return res.status(404).json({ message: 'Increment request not found.' });
    if (request.status !== 'ManagerApproved' && request.status !== 'Pending') {
      return res.status(400).json({ message: `Request status is ${request.status}, cannot approve.` });
    }

    const updated = await prisma.salaryIncrementRequest.update({
      where: { id },
      data: { status: 'Approved' }
    });

    if (request.employeeId) {
      await prisma.compensationProfile.update({
        where: { employeeId: request.employeeId },
        data: {
          monthlyCTC: request.requestedSalary,
          annualCTC: request.requestedSalary * 12,
          effectiveDate: request.effectiveDate
        }
      });
    }

    // ── Notify the employee that HR approved their increment ──
    try {
      const { createNotification } = require('../utils/notificationHelper');
      if (request.employee?.userId) {
        await createNotification({
          userId: request.employee.userId,
          title: 'Salary Increment Approved',
          message: `Your salary increment request has been approved by HR. Your new salary of ₹${Number(request.requestedSalary).toLocaleString()} is now effective.`,
          type: 'SUCCESS',
          link: '/employee/compensation'
        });
      }
    } catch (notifErr) {
      console.error('Failed to send HR approval notification:', notifErr);
    }

    res.json({ success: true, data: updated, message: 'Increment request approved and implemented successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.rejectHRIncrementRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.salaryIncrementRequest.findFirst({
      where: {
        id,
        employee: {
          user: {
            organizationId: req.user.organizationId
          }
        }
      },
      include: { employee: { include: { user: true } } }
    });

    if (!request) return res.status(404).json({ message: 'Increment request not found.' });

    const updated = await prisma.salaryIncrementRequest.update({
      where: { id },
      data: { status: 'Rejected' }
    });

    // ── Notify the employee that HR rejected their increment ──
    try {
      const { createNotification } = require('../utils/notificationHelper');
      if (request.employee?.userId) {
        await createNotification({
          userId: request.employee.userId,
          title: 'Salary Increment Rejected',
          message: `Your salary increment request has been rejected by HR.`,
          type: 'ALERT',
          link: '/employee/compensation'
        });
      }
    } catch (notifErr) {
      console.error('Failed to send HR rejection notification:', notifErr);
    }

    res.json({ success: true, data: updated, message: 'Increment request rejected.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
