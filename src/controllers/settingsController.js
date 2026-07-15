const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const defaultSettings = {
  id: 'global-settings',
  defaultCurrency: 'USD',
  defaultPhoneCountry: '+91',
  dateFormat: 'DD/MM/YYYY',
  platformMode: 'Production',
  maxOrgs: 'Unlimited',
  defaultTimezone: 'UTC+00:00 (London)',
  masterCurrency: 'USD ($) - US Dollar',
  globalMFA: true,
  auditLogRetention: '90 Days',
  failedLoginAttempts: 5,
  ipWhitelisting: false,
  basePricePerUser: 8.00,
  freeTrialDays: 14,
  gracePeriodDays: 7,
  invoiceInterval: 'Monthly',
  primaryModel: 'Google Gemini 1.5 Pro',
  resumeScanAutoRank: true,
  matchingThreshold: 75,
  apiRateLimit: 1200,
  reimbursementManagerApproval: true,
  reimbursementFinalApprovalRole: 'ADMIN'
};

// GET /api/settings
// Public/Authenticated route to fetch global settings
const getSettings = async (req, res, next) => {
  try {
    let settings = await prisma.globalSettings.findUnique({
      where: { id: 'global-settings' }
    });

    if (!settings) {
      // Create defaults if not found
      settings = await prisma.globalSettings.create({
        data: defaultSettings
      });
    }

    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

// PUT /api/settings
// Admin/SuperAdmin route to update global settings
const updateSettings = async (req, res, next) => {
  try {
    const data = req.body;
    
    const fieldsToUpdate = {};
    if (data.defaultCurrency !== undefined) fieldsToUpdate.defaultCurrency = data.defaultCurrency;
    if (data.defaultPhoneCountry !== undefined) fieldsToUpdate.defaultPhoneCountry = data.defaultPhoneCountry;
    if (data.dateFormat !== undefined) fieldsToUpdate.dateFormat = data.dateFormat;
    if (data.platformMode !== undefined) fieldsToUpdate.platformMode = data.platformMode;
    if (data.maxOrgs !== undefined) fieldsToUpdate.maxOrgs = data.maxOrgs;
    if (data.defaultTimezone !== undefined) fieldsToUpdate.defaultTimezone = data.defaultTimezone;
    if (data.masterCurrency !== undefined) fieldsToUpdate.masterCurrency = data.masterCurrency;
    if (data.globalMFA !== undefined) fieldsToUpdate.globalMFA = data.globalMFA;
    if (data.auditLogRetention !== undefined) fieldsToUpdate.auditLogRetention = data.auditLogRetention;
    if (data.failedLoginAttempts !== undefined) fieldsToUpdate.failedLoginAttempts = data.failedLoginAttempts;
    if (data.ipWhitelisting !== undefined) fieldsToUpdate.ipWhitelisting = data.ipWhitelisting;
    if (data.basePricePerUser !== undefined) fieldsToUpdate.basePricePerUser = data.basePricePerUser;
    if (data.freeTrialDays !== undefined) fieldsToUpdate.freeTrialDays = data.freeTrialDays;
    if (data.gracePeriodDays !== undefined) fieldsToUpdate.gracePeriodDays = data.gracePeriodDays;
    if (data.invoiceInterval !== undefined) fieldsToUpdate.invoiceInterval = data.invoiceInterval;
    if (data.primaryModel !== undefined) fieldsToUpdate.primaryModel = data.primaryModel;
    if (data.resumeScanAutoRank !== undefined) fieldsToUpdate.resumeScanAutoRank = data.resumeScanAutoRank;
    if (data.matchingThreshold !== undefined) fieldsToUpdate.matchingThreshold = data.matchingThreshold;
    if (data.apiRateLimit !== undefined) fieldsToUpdate.apiRateLimit = data.apiRateLimit;
    if (data.reimbursementManagerApproval !== undefined) fieldsToUpdate.reimbursementManagerApproval = data.reimbursementManagerApproval;
    if (data.reimbursementFinalApprovalRole !== undefined) fieldsToUpdate.reimbursementFinalApprovalRole = data.reimbursementFinalApprovalRole;

    const updated = await prisma.globalSettings.upsert({
      where: { id: 'global-settings' },
      update: fieldsToUpdate,
      create: { ...defaultSettings, ...fieldsToUpdate }
    });

    return res.status(200).json({ success: true, data: updated, message: 'Global settings updated successfully.' });
  } catch (error) {
    console.error('Settings update error:', error);
    next(error);
  }
};

// GET /api/settings/master-currency
const getMasterCurrency = async (req, res, next) => {
  try {
    let settings = await prisma.globalSettings.findUnique({
      where: { id: 'global-settings' },
      select: { masterCurrency: true }
    });

    if (!settings) {
      settings = await prisma.globalSettings.create({
        data: defaultSettings,
        select: { masterCurrency: true }
      });
    }

    return res.status(200).json({ success: true, data: { currency: settings.masterCurrency } });
  } catch (error) {
    next(error);
  }
};

// PUT /api/settings/master-currency
const updateMasterCurrency = async (req, res, next) => {
  try {
    const { currency } = req.body;
    if (!currency) {
      return res.status(400).json({ success: false, message: 'Currency is required' });
    }

    const updated = await prisma.globalSettings.upsert({
      where: { id: 'global-settings' },
      update: { masterCurrency: currency, defaultCurrency: currency }, // Sync both for backward compatibility initially
      create: { ...defaultSettings, masterCurrency: currency, defaultCurrency: currency }
    });

    // Optional: Log to audit logs if user info is available (assuming req.user exists)
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE_MASTER_CURRENCY',
          details: `Master currency updated to ${currency}`
        }
      });
    }

    return res.status(200).json({ success: true, data: { currency: updated.masterCurrency }, message: 'Master currency updated successfully.' });
  } catch (error) {
    console.error('Master Currency update error:', error);
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getMasterCurrency,
  updateMasterCurrency
};
