const prisma = require('../config/prisma');
const { validateWorkflow } = require('../services/workflowValidation.service');
const approvalService = require('../services/approval.service');

// ─────────────────────────────────────────
// WORKFLOW CONFIGURATION APIS
// ─────────────────────────────────────────

const getWorkflows = async (req, res, next) => {
  try {
    const orgId = req.user.organizationId;
    const workflows = await prisma.approvalWorkflow.findMany({
      where: { organizationId: orgId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: workflows });
  } catch (err) { next(err); }
};

const getWorkflowByModule = async (req, res, next) => {
  try {
    const orgId = req.user.organizationId;
    const { module } = req.params;
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { organizationId: orgId, module, isActive: true, status: 'Active' },
      include: { steps: { orderBy: { sequence: 'asc' } } }
    });
    
    if (!workflow) {
      return res.status(404).json({ success: false, message: 'No active workflow found for this module.' });
    }
    return res.status(200).json({ success: true, data: workflow });
  } catch (err) { next(err); }
};

const createWorkflow = async (req, res, next) => {
  try {
    const orgId = req.user.organizationId;
    const { name, module, description, steps } = req.body;

    await validateWorkflow({ module, steps });

    // Mark previous active version as inactive
    await prisma.approvalWorkflow.updateMany({
      where: { organizationId: orgId, module, isActive: true },
      data: { isActive: false, status: 'Archived' }
    });

    // Find latest version number
    const latest = await prisma.approvalWorkflow.findFirst({
      where: { organizationId: orgId, module },
      orderBy: { version: 'desc' }
    });
    const newVersion = latest ? latest.version + 1 : 1;

    // Create new workflow with steps
    const newWorkflow = await prisma.approvalWorkflow.create({
      data: {
        organizationId: orgId,
        name,
        module,
        description,
        version: newVersion,
        status: 'Active',
        isActive: true,
        effectiveDate: new Date(),
        steps: {
          create: steps.map(s => ({
            stepOrder: s.sequence,
            sequence: s.sequence,
            approverType: s.approverType,
            approverRole: s.approverRole,
            canSkip: s.canSkip || false,
            isRequired: s.isRequired !== undefined ? s.isRequired : true
          }))
        }
      },
      include: { steps: true }
    });

    return res.status(201).json({ success: true, data: newWorkflow });
  } catch (err) { 
    console.error('Workflow creation error:', err);
    return res.status(400).json({ success: false, error: { message: err.message } }); 
  }
};

const updateWorkflow = async (req, res, next) => {
  try {
    // When updating, we actually create a new version to preserve history
    const orgId = req.user.organizationId;
    const { id } = req.params;
    const { name, module, description, steps } = req.body;

    await validateWorkflow({ module, steps });

    const existing = await prisma.approvalWorkflow.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Workflow not found.' });

    // Archive current
    await prisma.approvalWorkflow.update({
      where: { id },
      data: { isActive: false, status: 'Archived' }
    });

    const newVersion = existing.version + 1;

    const newWorkflow = await prisma.approvalWorkflow.create({
      data: {
        organizationId: orgId,
        name,
        module,
        description,
        version: newVersion,
        status: 'Active',
        isActive: true,
        effectiveDate: new Date(),
        steps: {
          create: steps.map(s => ({
            stepOrder: s.sequence,
            sequence: s.sequence,
            approverType: s.approverType,
            approverRole: s.approverRole,
            canSkip: s.canSkip || false,
            isRequired: s.isRequired !== undefined ? s.isRequired : true
          }))
        }
      },
      include: { steps: true }
    });

    return res.status(200).json({ success: true, data: newWorkflow });
  } catch (err) {
    return res.status(400).json({ success: false, error: { message: err.message } }); 
  }
};

const deleteWorkflow = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.approvalWorkflow.update({
      where: { id },
      data: { isActive: false, status: 'Archived' }
    });
    return res.status(200).json({ success: true, message: 'Workflow archived successfully.' });
  } catch (err) { next(err); }
};

const unarchiveWorkflow = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.approvalWorkflow.update({
      where: { id },
      data: { isActive: true, status: 'Active' }
    });
    return res.status(200).json({ success: true, message: 'Workflow unarchived successfully.' });
  } catch (err) { next(err); }
};

const hardDeleteWorkflow = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.approvalWorkflow.delete({
      where: { id }
    });
    return res.status(200).json({ success: true, message: 'Workflow deleted successfully.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// GENERIC APPROVAL APIS
// ─────────────────────────────────────────

const approveEntity = async (req, res, next) => {
  try {
    const { module, entityId } = req.params;
    const { comments } = req.body;
    const approverUserId = req.user.userId;

    const result = await approvalService.processApproval(module, entityId, approverUserId, 'APPROVE', comments);
    
    return res.status(200).json({ success: true, data: result, message: 'Approval processed successfully.' });
  } catch (err) {
    return res.status(400).json({ success: false, error: { message: err.message } });
  }
};

const rejectEntity = async (req, res, next) => {
  try {
    const { module, entityId } = req.params;
    const { comments } = req.body;
    const approverUserId = req.user.userId;

    const result = await approvalService.processApproval(module, entityId, approverUserId, 'REJECT', comments);
    
    return res.status(200).json({ success: true, data: result, message: 'Rejection processed successfully.' });
  } catch (err) {
    return res.status(400).json({ success: false, error: { message: err.message } });
  }
};

const getTimeline = async (req, res, next) => {
  try {
    const { module, entityId } = req.params;
    const timeline = await approvalService.getApprovalHistory(module, entityId);
    return res.status(200).json({ success: true, data: timeline });
  } catch (err) { next(err); }
};

const getCurrentStep = async (req, res, next) => {
  try {
    const { module, entityId } = req.params;
    const current = await approvalService.getCurrentStep(module, entityId);
    return res.status(200).json({ success: true, data: current });
  } catch (err) { next(err); }
};

module.exports = {
  getWorkflows,
  getWorkflowByModule,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  hardDeleteWorkflow,
  unarchiveWorkflow,
  approveEntity,
  rejectEntity,
  getTimeline,
  getCurrentStep
};
