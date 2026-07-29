// ============================================================
// Org Chart Service
// ============================================================
// Builds a fully nested hierarchical tree structure for the
// Organization Chart from departments and employees.
// Uses exactly 2 database queries (departments + employees)
// and assembles the tree in O(N) time using hash maps.

const prisma = require('../config/prisma');

/**
 * Builds the complete org chart tree for a given organization.
 * @param {string} organizationId - The tenant organization ID.
 * @param {string|null} departmentId - Optional: load only a specific branch.
 * @returns {Object} { organization, tree }
 */
const buildOrgChart = async (organizationId, departmentId = null) => {
  // 1. Fetch organization info
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      industry: true,
    },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // 2. Fetch all departments (2 queries total — this is query 1)
  const departmentWhere = { organizationId };
  const departments = await prisma.department.findMany({
    where: departmentWhere,
    select: {
      id: true,
      name: true,
      code: true,
      head: true,
      color: true,
      status: true,
      parentId: true,
      parent: true,
      _count: { select: { employees: true } },
    },
    orderBy: { name: 'asc' },
  });

  // 3. Fetch all employees with their user info and manager info (query 2)
  const employees = await prisma.employeeProfile.findMany({
    where: {
      user: { organizationId },
    },
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      employeeId: true,
      departmentId: true,
      managerId: true,
      employmentType: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
      department: {
        select: {
          id: true,
          name: true,
        },
      },
      manager: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  // 4. Build department tree using hash map — O(N)
  const deptMap = new Map();
  const rootDepts = [];

  // Initialize department nodes
  for (const dept of departments) {
    deptMap.set(dept.id, {
      type: 'department',
      id: dept.id,
      name: dept.name,
      code: dept.code,
      head: dept.head,
      color: dept.color || '#4f46e5',
      status: dept.status || 'Active',
      parentId: dept.parentId,
      parentName: dept.parent || 'Corporate',
      employeeCount: dept._count.employees,
      children: [],    // child departments
      employees: [],   // direct employees in this department
    });
  }

  // Link departments to their parents
  for (const dept of departments) {
    const node = deptMap.get(dept.id);
    if (dept.parentId && deptMap.has(dept.parentId)) {
      deptMap.get(dept.parentId).children.push(node);
    } else {
      rootDepts.push(node);
    }
  }

  // 5. Build employee reporting tree within each department — O(N)
  const empMap = new Map();

  // Initialize employee nodes
  for (const emp of employees) {
    empMap.set(emp.id, {
      type: 'employee',
      id: emp.id,
      employeeId: emp.employeeId,
      fullName: emp.fullName,
      avatarUrl: emp.avatarUrl,
      email: emp.user?.email,
      role: emp.user?.role,
      employmentType: emp.employmentType,
      departmentId: emp.departmentId,
      departmentName: emp.department?.name || 'Unassigned',
      managerId: emp.managerId,
      managerName: emp.manager?.fullName || null,
      directReports: [],
    });
  }

  // Build manager → reports tree
  const rootEmployees = []; // employees with no manager or manager outside this org
  for (const emp of employees) {
    const empNode = empMap.get(emp.id);
    if (emp.managerId && empMap.has(emp.managerId)) {
      empMap.get(emp.managerId).directReports.push(empNode);
    } else {
      rootEmployees.push(empNode);
    }
  }

  // 6. Attach employees to their department nodes
  for (const emp of employees) {
    const empNode = empMap.get(emp.id);
    if (emp.departmentId && deptMap.has(emp.departmentId)) {
      // Only add root-level employees (no manager or manager in different dept)
      // to department.employees to avoid duplicating them under both dept and manager
      const isRootInDept = !emp.managerId || !empMap.has(emp.managerId) ||
        empMap.get(emp.managerId).departmentId !== emp.departmentId;
      if (isRootInDept) {
        deptMap.get(emp.departmentId).employees.push(empNode);
      }
    }
  }

  // 7. Handle unassigned employees (no department)
  const unassignedEmployees = rootEmployees.filter(e => !e.departmentId);

  // If filtering by specific department, return just that branch
  if (departmentId && deptMap.has(departmentId)) {
    return {
      organization,
      tree: [deptMap.get(departmentId)],
      unassignedEmployees,
    };
  }

  return {
    organization,
    tree: rootDepts,
    unassignedEmployees,
    stats: {
      totalDepartments: departments.length,
      totalEmployees: employees.length,
      rootDepartments: rootDepts.length,
      unassignedCount: unassignedEmployees.length,
    },
  };
};

module.exports = { buildOrgChart };
