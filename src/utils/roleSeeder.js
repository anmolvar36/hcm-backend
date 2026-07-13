// ============================================================
// Role Seeder - Ensures default CustomRoles exist in DB
// Shared by adminController and authController
// ============================================================

const prisma = require('../config/prisma');

const DEFAULT_ROLES = [
  {
    name: 'Super Admin',
    description: 'Ultimate system access',
    isCustom: false,
    inheritsFrom: 'SUPERADMIN',
    permissions: {
      dashboard: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      org_setup: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      departments: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      users: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      roles_permissions: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      payroll_center: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      holidays: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      benefits_config: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      ai_center: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      compliance: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      integrations: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      billing: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      audit_logs: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      reports: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      settings: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    }
  },
  {
    name: 'Admin',
    description: 'Full system access',
    isCustom: false,
    inheritsFrom: 'ADMIN',
    permissions: {
      dashboard: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      org_setup: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      departments: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      users: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      roles_permissions: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      payroll_center: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      holidays: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      benefits_config: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      ai_center: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      compliance: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      integrations: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      billing: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      audit_logs: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      reports: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      settings: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    }
  },
  {
    name: 'HR Manager',
    description: 'People management access',
    isCustom: false,
    inheritsFrom: 'HR',
    permissions: {
      dashboard: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      job_posts: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      candidates: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      interviews: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      hiring_pipeline: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      offer_management: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      onboarding: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      payroll_operations: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      reports: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      messages: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    }
  },
  {
    name: 'Manager',
    description: 'Team management access',
    isCustom: false,
    inheritsFrom: 'MANAGER',
    permissions: {
      dashboard: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      team_members: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      attendance_review: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      leave_approval: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      kpi_tracking: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      tasks: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      reviews: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      reports: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    }
  },
  {
    name: 'Employee',
    description: 'Standard user access',
    isCustom: false,
    inheritsFrom: 'EMPLOYEE',
    permissions: {
      dashboard: ['view'],
      profile: ['view', 'edit'],
      attendance: ['view', 'create'],
      leave: ['view', 'create'],
      payroll: ['view'],
      benefits: ['view'],
      documents: ['view', 'create'],
      performance: ['view'],
      help_desk: ['view', 'create'],
    }
  },
  {
    name: 'Candidate',
    description: 'Limited portal access',
    isCustom: false,
    inheritsFrom: 'CANDIDATE',
    permissions: {
      dashboard: ['view'],
      browse_jobs: ['view'],
      my_applications: ['view', 'create'],
      resume_builder: ['view', 'create', 'edit'],
      ai_resume_score: ['view', 'create'],
      interview_schedule: ['view'],
      notifications: ['view'],
    }
  }
];

/**
 * Ensures all default roles exist in the DB.
 * Only creates roles that don't already exist - never overwrites existing customized roles.
 */
const ensureDefaultRoles = async () => {
  for (const role of DEFAULT_ROLES) {
    const existing = await prisma.customRole.findFirst({ where: { name: role.name } });
    if (!existing) {
      await prisma.customRole.create({
        data: {
          name: role.name,
          description: role.description,
          isCustom: role.isCustom,
          inheritsFrom: role.inheritsFrom,
          permissions: JSON.stringify(role.permissions),
        }
      });
    }
  }
};

/**
 * Gets the CustomRole name for a given system role enum value.
 */
const getRoleCustomName = (role) => {
  const map = {
    SUPERADMIN: 'Super Admin',
    ADMIN: 'Admin',
    HR: 'HR Manager',
    MANAGER: 'Manager',
    EMPLOYEE: 'Employee',
    CANDIDATE: 'Candidate',
  };
  return map[role] || null;
};

module.exports = { ensureDefaultRoles, getRoleCustomName, DEFAULT_ROLES };
