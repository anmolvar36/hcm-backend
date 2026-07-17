// ============================================================
// Admin Routes  →  /api/admin/*
// ============================================================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');

const {
  getDashboardStats,
  getOrganization, createOrganization, updateOrganization,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getAllUsers, createUser, changeUserRole, toggleUserActive, deleteUser,
  getAllPayslips, generatePayslip, markPayslipPaid,
  getAuditLogs,
  getPolicies, createPolicy, updatePolicy, deletePolicy, toggleArchivePolicy, renewPolicy, sendPolicyReminder,
  getRoles, createRole, updateRole, deleteRole,
  getHolidays, createHoliday, updateHoliday, deleteHoliday,
  getBenefitPlans, createBenefitPlan, updateBenefitPlan, deleteBenefitPlan,
  getAiModules, updateAiModule, getAiLogs, createAiLog,
  getIntegrations, createIntegration, updateIntegration, deleteIntegration,
  getBillingPlan, updateBillingPlan, getInvoices, createInvoice, updateInvoice, deleteInvoice, exportInvoices,
  getAllAttendance, addManualAttendance, getAllLeaves, reviewLeave,
  getAdminResignations, overrideResignation
} = require('../controllers/adminController');

const {
  getSalaryComponents, createSalaryComponent, updateSalaryComponent, deleteSalaryComponent,
  getDeductions,
  createDeduction,
  deleteDeduction,
  getTaxRules, createTaxRule,
  deleteTaxRule,
  getWorkflows, createWorkflow
} = require('../controllers/payrollConfigController');

const {
  getShifts, createShift, updateShift, deleteShift
} = require('../controllers/shiftController');

const {
  getOvertimePolicies, createOvertimePolicy, updateOvertimePolicy, deleteOvertimePolicy
} = require('../controllers/overtimePolicyController');

// Only ADMIN, SUPERADMIN, and HR (for shared dashboards like Payroll Center)
router.use(protect, authorize('ADMIN', 'SUPERADMIN', 'HR'));

// Dashboard
router.get('/stats', getDashboardStats);

// Organization
router.get('/organization', getOrganization);
router.post('/organization', createOrganization);
router.put('/organization/:id', updateOrganization);

// Departments
router.get('/departments', getDepartments);
router.post('/departments', createDepartment);
router.put('/departments/:id', updateDepartment);
router.delete('/departments/:id', deleteDepartment);

// Users
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.patch('/users/:id/role', changeUserRole);
router.patch('/users/:id/toggle-active', toggleUserActive);
router.delete('/users/:id', deleteUser);

// Payroll
router.get('/payslips', getAllPayslips);
router.post('/payslips', generatePayslip);
router.patch('/payslips/:id/pay', markPayslipPaid);

// Payroll Configuration (New Enterprise Payroll)
router.get('/payroll-config/components', getSalaryComponents);
router.post('/payroll-config/components', createSalaryComponent);
router.put('/payroll-config/components/:id', updateSalaryComponent);
router.delete('/payroll-config/components/:id', deleteSalaryComponent);

router.get('/payroll-config/deductions', getDeductions);
router.post('/payroll-config/deductions', createDeduction);
router.delete('/payroll-config/deductions/:id', deleteDeduction);

router.get('/payroll-config/taxes', getTaxRules);
router.post('/payroll-config/taxes', createTaxRule);
router.delete('/payroll-config/taxes/:id', deleteTaxRule);

// Approval Workflows
router.get('/workflows', getWorkflows);
router.post('/workflows', createWorkflow);

// Audit Logs
router.get('/audit-logs', getAuditLogs);

// Policies
router.get('/policies', getPolicies);
router.post('/policies', createPolicy);
router.put('/policies/:id', updatePolicy);
router.delete('/policies/:id', deletePolicy);
router.patch('/policies/:id/archive', toggleArchivePolicy);
router.post('/policies/:id/renew', renewPolicy);
router.post('/policies/:id/remind', sendPolicyReminder);

// Roles & Permissions
router.get('/roles', getRoles);
router.post('/roles', createRole);
router.put('/roles/:id', updateRole);
router.delete('/roles/:id', deleteRole);

// Holidays
router.get('/holidays', getHolidays);
router.post('/holidays', createHoliday);
router.put('/holidays/:id', updateHoliday);
router.delete('/holidays/:id', deleteHoliday);

// Benefit Plans
router.get('/benefits', getBenefitPlans);
router.post('/benefits', createBenefitPlan);
router.put('/benefits/:id', updateBenefitPlan);
router.delete('/benefits/:id', deleteBenefitPlan);

// AI Center
router.get('/ai/modules', getAiModules);
router.put('/ai/modules/:id', updateAiModule);
router.get('/ai/logs', getAiLogs);
router.post('/ai/logs', createAiLog);

// System Integrations
router.get('/integrations', getIntegrations);
router.post('/integrations', createIntegration);
router.put('/integrations/:id', updateIntegration);
router.delete('/integrations/:id', deleteIntegration);

// Billing & Invoices
router.get('/billing/plan', getBillingPlan);
router.put('/billing/plan/:id', updateBillingPlan);
router.get('/billing/invoices', getInvoices);
router.post('/billing/invoices', createInvoice);
router.put('/billing/invoices/:id', updateInvoice);
router.delete('/billing/invoices/:id', deleteInvoice);
router.get('/billing/invoices/export', exportInvoices);

// Attendance & Leaves
router.get('/attendance', getAllAttendance);
router.post('/attendance', addManualAttendance);
router.get('/leaves', getAllLeaves);
router.patch('/leaves/:id', reviewLeave);

// Resignations
router.get('/resignations', getAdminResignations);
router.patch('/resignations/:id/override', overrideResignation);

// Shifts
router.get('/shifts', getShifts);
router.post('/shifts', createShift);
router.put('/shifts/:id', updateShift);
router.delete('/shifts/:id', deleteShift);

// Overtime Policies
router.get('/overtime-policies', getOvertimePolicies);
router.post('/overtime-policies', createOvertimePolicy);
router.put('/overtime-policies/:id', updateOvertimePolicy);
router.delete('/overtime-policies/:id', deleteOvertimePolicy);

module.exports = router;

