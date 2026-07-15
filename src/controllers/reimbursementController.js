const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/reimbursements/approvals
const getFinalApprovals = async (req, res, next) => {
  try {
    const claims = await prisma.benefitClaim.findMany({
      where: {
        OR: [
          { managerStatus: 'Approved' },
          { overallStatus: 'Pending Final Approval' },
          { finalApprovalStatus: { not: 'Pending' } }
        ]
      },
      include: {
        employee: { select: { fullName: true, department: { select: { name: true } }, employeeId: true } }
      },
      orderBy: { claimedAt: 'desc' }
    });

    return res.status(200).json({ success: true, data: claims });
  } catch (err) { next(err); }
};

// PATCH /api/reimbursements/:id/approve
const reviewFinalApproval = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body; // status: 'Approved', 'Rejected'
    
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid status' } });
    }

    const claim = await prisma.benefitClaim.findUnique({ where: { id }, include: { employee: true } });
    if (!claim) return res.status(404).json({ success: false, error: { message: 'Claim not found.' } });

    const approverProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    const approverName = approverProfile ? approverProfile.fullName : req.user.role;

    const overallStatus = status === 'Approved' ? 'Approved' : 'Rejected by Final Approver';
    
    let history = [];
    if (claim.approvalHistory) {
      try { history = JSON.parse(claim.approvalHistory); } catch(e) {}
    }
    history.push({
      action: status === 'Approved' ? 'Final Approved' : 'Final Rejected',
      actor: approverName,
      date: new Date().toISOString(),
      comment: comment || ''
    });

    const updatedClaim = await prisma.benefitClaim.update({
      where: { id },
      data: {
        finalApprovalStatus: status,
        finalApproverId: req.user.userId,
        finalApproverRole: req.user.role,
        finalApprovalComment: comment,
        finalApprovedAt: new Date(),
        overallStatus,
        approvalHistory: JSON.stringify(history)
      }
    });

    // Notification to Employee
    await prisma.notification.create({
      data: {
        userId: claim.employee.userId,
        type: 'INFO',
        title: 'Reimbursement Claim Update',
        message: `Your claim for ${claim.title} was ${status.toLowerCase()} by final approver.`,
        isRead: false
      }
    });

    return res.status(200).json({ success: true, data: updatedClaim, message: `Claim ${status.toLowerCase()} successfully.` });
  } catch (err) { next(err); }
};

// PATCH /api/reimbursements/:id/process-payment
const processPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { paymentDate, paymentMethod, paymentReference, notes } = req.body;

    const claim = await prisma.benefitClaim.findUnique({ where: { id }, include: { employee: true } });
    if (!claim) return res.status(404).json({ success: false, error: { message: 'Claim not found.' } });
    
    if (claim.finalApprovalStatus !== 'Approved') {
      return res.status(400).json({ success: false, error: { message: 'Claim must be approved before payment processing.' } });
    }

    const approverProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    const processorName = approverProfile ? approverProfile.fullName : req.user.role;
    
    let history = [];
    if (claim.approvalHistory) {
      try { history = JSON.parse(claim.approvalHistory); } catch(e) {}
    }
    history.push({
      action: 'Payment Processed',
      actor: processorName,
      date: new Date().toISOString(),
      comment: `Method: ${paymentMethod}, Ref: ${paymentReference}. Notes: ${notes || ''}`
    });

    const updatedClaim = await prisma.benefitClaim.update({
      where: { id },
      data: {
        paymentStatus: 'Processed',
        paymentMethod,
        paymentReference,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        overallStatus: 'Completed',
        approvalHistory: JSON.stringify(history)
      }
    });

    // Notification to Employee
    await prisma.notification.create({
      data: {
        userId: claim.employee.userId,
        type: 'SUCCESS',
        title: 'Reimbursement Payment Processed',
        message: `Payment for your claim ${claim.title} has been processed.`,
        isRead: false
      }
    });

    return res.status(200).json({ success: true, data: updatedClaim, message: 'Payment processed successfully.' });
  } catch (err) { next(err); }
};

module.exports = {
  getFinalApprovals,
  reviewFinalApproval,
  processPayment
};
