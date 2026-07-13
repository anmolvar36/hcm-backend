// Centralized Permission Configuration for Custom Roles

// Defines all modules available in the system mapped to base roles
const ROLE_MODULES = {
  SUPERADMIN: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'organizations', label: 'Organizations' },
    { id: 'users', label: 'Platform Users' },
    { id: 'payroll_global', label: 'Global Payroll' },
    { id: 'audit_logs', label: 'System Logs' },
    { id: 'settings', label: 'Platform Settings' },
  ],
  ADMIN: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'org_setup', label: 'Org Setup' },
    { id: 'departments', label: 'Departments' },
    { id: 'users', label: 'Users' },
    { id: 'roles_permissions', label: 'Roles & Permissions' },
    { id: 'payroll_center', label: 'Payroll Center' },
    { id: 'holidays', label: 'Holidays' },
    { id: 'benefits_config', label: 'Benefits Config' },
    { id: 'ai_center', label: 'AI Center' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'billing', label: 'Billing' },
    { id: 'audit_logs', label: 'Audit Logs' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' },
  ],
  HR: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'job_posts', label: 'Job Posts' },
    { id: 'candidates', label: 'Candidates' },
    { id: 'interviews', label: 'Interviews' },
    { id: 'hiring_pipeline', label: 'Hiring Pipeline' },
    { id: 'offer_management', label: 'Offer Management' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'reports', label: 'Reports' },
    { id: 'messages', label: 'Messages' },
  ],
  MANAGER: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'team_members', label: 'Team Members' },
    { id: 'attendance_review', label: 'Attendance Review' },
    { id: 'leave_approval', label: 'Leave Approval' },
    { id: 'kpi_tracking', label: 'KPI Tracking' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'reports', label: 'Reports' },
  ],
  EMPLOYEE: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'profile', label: 'Profile' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'leave', label: 'Leave' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'benefits', label: 'Benefits' },
    { id: 'documents', label: 'Documents' },
    { id: 'performance', label: 'Performance' },
    { id: 'help_desk', label: 'Help Desk' },
  ],
  CANDIDATE: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'browse_jobs', label: 'Browse Jobs' },
    { id: 'my_applications', label: 'My Applications' },
    { id: 'resume_builder', label: 'Resume Builder' },
    { id: 'messages', label: 'Messages' },
    { id: 'offers', label: 'Offers' },
    { id: 'settings', label: 'Settings' },
  ],
};

// Defines the available actions for specific modules
// If a module is not defined here, it assumes only 'view' is available.
const MODULE_ACTIONS = {
  users: ['view', 'create', 'edit', 'delete'],
  departments: ['view', 'create', 'edit', 'delete'],
  roles_permissions: ['view', 'create', 'edit', 'delete'],
  payroll_center: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
  holidays: ['view', 'create', 'edit', 'delete'],
  benefits_config: ['view', 'create', 'edit', 'delete'],
  ai_center: ['view', 'manage'],
  compliance: ['view', 'create', 'edit', 'delete'],
  integrations: ['view', 'create', 'edit', 'delete'],
  billing: ['view', 'manage'],
  audit_logs: ['view'],
  reports: ['view', 'manage'],
  settings: ['view', 'edit'],

  job_posts: ['view', 'create', 'edit', 'delete'],
  candidates: ['view', 'create', 'edit', 'delete'],
  interviews: ['view', 'create', 'edit', 'delete'],
  hiring_pipeline: ['view', 'manage'],
  offer_management: ['view', 'create', 'edit', 'delete', 'approve'],
  onboarding: ['view', 'manage'],

  team_members: ['view'],
  attendance_review: ['view', 'approve'],
  leave_approval: ['view', 'approve'],
  kpi_tracking: ['view', 'create', 'edit', 'delete'],
  tasks: ['view', 'create', 'edit', 'delete'],
  reviews: ['view', 'create', 'edit', 'delete'],

  profile: ['view', 'edit'],
  attendance: ['view', 'create'],
  leave: ['view', 'create', 'delete'],
  payroll: ['view'],
  benefits: ['view', 'create'],
  documents: ['view', 'create', 'delete'],
  performance: ['view'],
  help_desk: ['view', 'create'],

  browse_jobs: ['view', 'create'],
  my_applications: ['view', 'delete'],
  resume_builder: ['view', 'edit'],
  messages: ['view', 'create'],
  offers: ['view', 'approve'],
};

// Permission Dependencies: 
// E.g., if you have 'create', you MUST have 'view'.
// The UI logic will enforce this (selecting 'create' auto-selects 'view').
const PERMISSION_DEPENDENCIES = {
  create: ['view'],
  edit: ['view'],
  delete: ['view'],
  approve: ['view'],
  manage: ['view', 'edit'],
};

// Helper function to resolve dependencies
const resolveDependencies = (actions) => {
  const resolved = new Set(actions);
  actions.forEach(action => {
    if (PERMISSION_DEPENDENCIES[action]) {
      PERMISSION_DEPENDENCIES[action].forEach(dep => resolved.add(dep));
    }
  });
  return Array.from(resolved);
};

module.exports = {
  ROLE_MODULES,
  MODULE_ACTIONS,
  PERMISSION_DEPENDENCIES,
  resolveDependencies,
};
