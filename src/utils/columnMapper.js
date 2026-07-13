/**
 * Defines the accepted schemas and column aliases for each entity.
 * This ensures we only extract what we need and gracefully ignore extra columns.
 */

const schemas = {
  users: {
    fields: ['email', 'passwordHash', 'role', 'status'],
    aliases: {
      'E-mail': 'email',
      'Mail': 'email',
      'Email Address': 'email',
      'Role': 'role',
      'Organization Role': 'role',
      'Status': 'status',
      'Password': 'passwordHash'
    }
  },
  employees: {
    fields: [
      'employeeId', 'fullName', 'email', 'phone', 'department',
      'designation', 'joiningDate', 'employmentType', 'role', 'status', 'manager', 'address',
      'monthlyCTC', 'effectiveDate', 'salaryStructure', 'reason', 'privateNotes'
    ],
    templateHeaders: [
      'Employee ID', 'Full Name', 'Email Address', 'Phone Number', 'Department',
      'Designation', 'Joining Date', 'Employment Type', 'Organization Role',
      'Status', 'Reporting Manager', 'Residential Address',
      'Monthly CTC', 'Effective Date', 'Salary Structure', 'Reason / Notes for Salary update', 'Private Notes'
    ],
    aliases: {
      'Employee ID': 'employeeId',
      'Employee Code': 'employeeId',
      'Emp Code': 'employeeId',
      'Emp ID': 'employeeId',
      'EmpID': 'employeeId',
      'Emp. ID': 'employeeId',
      'ID': 'employeeId',
      'Staff ID': 'employeeId',
      'Staff Code': 'employeeId',
      'Worker ID': 'employeeId',
      'First Name': 'firstName',
      'Full Name': 'fullName',
      'Emp Name': 'fullName',
      'Name': 'fullName',
      'E-mail': 'email',
      'Mail': 'email',
      'Email Address': 'email',
      'Email': 'email',
      'Phone': 'phone',
      'Phone Number': 'phone',
      'Contact': 'phone',
      'Contact Number': 'phone',
      'Mobile': 'phone',
      'Mobile Number': 'phone',
      'Mobile No': 'phone',
      'Department': 'department',
      'Dept': 'department',
      'Designation': 'designation',
      'Title': 'designation',
      'Joining Date': 'joiningDate',
      'Date of Joining': 'joiningDate',
      'DOJ': 'joiningDate',
      'Employment Type': 'employmentType',
      'Organization Role': 'role',
      'Role': 'role',
      'Status': 'status',
      'Reporting Manager': 'manager',
      'Manager': 'manager',
      'Residential Address': 'address',
      'Address': 'address',
      'Monthly CTC': 'monthlyCTC',
      'CTC': 'monthlyCTC',
      'CTC (Salary)': 'monthlyCTC',
      'Salary': 'monthlyCTC',
      'Monthly Salary': 'monthlyCTC',
      'CTC Amount': 'monthlyCTC',
      'Base Salary': 'monthlyCTC',
      'Effective Date': 'effectiveDate',
      'Salary Structure': 'salaryStructure',
      'Reason / Notes for Salary update': 'reason',
      'Private Notes': 'privateNotes'
    }
  },
  candidates: {
    fields: ['fullName', 'email', 'phone', 'location', 'expectedSalary', 'experience', 'skills', 'linkedin', 'portfolio', 'status'],
    templateHeaders: ['Full Name', 'Email Address', 'Phone Number', 'Location', 'Expected Salary', 'Experience (Years)', 'Skills', 'LinkedIn URL', 'Portfolio URL', 'Status'],
    aliases: {
      'Full Name': 'fullName',
      'Name': 'fullName',
      'Email Address': 'email',
      'Email': 'email',
      'E-mail': 'email',
      'Phone Number': 'phone',
      'Phone': 'phone',
      'Location': 'location',
      'Expected Salary': 'expectedSalary',
      'Experience (Years)': 'experience',
      'Experience': 'experience',
      'Skills': 'skills',
      'LinkedIn URL': 'linkedin',
      'LinkedIn': 'linkedin',
      'Portfolio URL': 'portfolio',
      'Portfolio': 'portfolio',
      'Status': 'status'
    }
  },
  departments: {
    fields: ['name', 'code', 'head', 'parent', 'description', 'color', 'status'],
    templateHeaders: ['Department Name', 'Dept. Code', 'H.O.D (Head)', 'Parent Department', 'Description', 'Color Theme', 'Status'],
    aliases: {
      'Department Name': 'name',
      'Name': 'name',
      'Dept. Code': 'code',
      'Code': 'code',
      'H.O.D (Head)': 'head',
      'Head': 'head',
      'Department Head': 'head',
      'Parent Department': 'parent',
      'Parent': 'parent',
      'Description': 'description',
      'Color Theme': 'color',
      'Color': 'color',
      'Status': 'status'
    }
  },
  attendance: {
    fields: ['userId', 'date', 'clockIn', 'clockOut', 'status', 'mode', 'managerId'],
    templateHeaders: ['User ID', 'Date (YYYY-MM-DD)', 'Clock In (YYYY-MM-DD HH:MM)', 'Clock Out (YYYY-MM-DD HH:MM)', 'Status', 'Work Mode', 'Manager ID'],
    aliases: {
      'User ID': 'userId',
      'Employee ID': 'userId',
      'Date': 'date',
      'Date (YYYY-MM-DD)': 'date',
      'Clock In': 'clockIn',
      'Clock In (YYYY-MM-DD HH:MM)': 'clockIn',
      'Clock Out': 'clockOut',
      'Clock Out (YYYY-MM-DD HH:MM)': 'clockOut',
      'Status': 'status',
      'Work Mode': 'mode',
      'Mode': 'mode',
      'Manager ID': 'managerId',
      'Manager': 'managerId',
      'Reporting Manager': 'managerId'
    }
  },
  leave: {
    fields: ['userId', 'leaveType', 'startDate', 'endDate', 'totalDays', 'reason', 'status', 'managerComment', 'emergencyContact', 'managerId'],
    templateHeaders: ['User ID', 'Leave Type', 'Start Date (YYYY-MM-DD)', 'End Date (YYYY-MM-DD)', 'Total Days', 'Reason', 'Status', 'Manager Comment', 'Emergency Contact', 'Manager ID'],
    aliases: {
      'User ID': 'userId',
      'Employee ID': 'userId',
      'Leave Type': 'leaveType',
      'Type': 'leaveType',
      'Start Date': 'startDate',
      'Start Date (YYYY-MM-DD)': 'startDate',
      'End Date': 'endDate',
      'End Date (YYYY-MM-DD)': 'endDate',
      'Total Days': 'totalDays',
      'Reason': 'reason',
      'Status': 'status',
      'Manager Comment': 'managerComment',
      'Emergency Contact': 'emergencyContact',
      'Manager ID': 'managerId',
      'Manager': 'managerId',
      'Reporting Manager': 'managerId'
    }
  },
  payroll: {
    fields: ['employeeId', 'month', 'basic', 'hra', 'allowance', 'bonus', 'pf', 'tax', 'netPay', 'status', 'paymentDate', 'currency'],
    templateHeaders: ['Employee ID', 'Month (YYYY-MM)', 'Basic Salary', 'HRA', 'Allowance', 'Bonus', 'PF Contribution', 'Income Tax', 'Net Pay', 'Status', 'Payment Date (YYYY-MM-DD)', 'Currency'],
    aliases: {
      'Employee ID': 'employeeId',
      'Month': 'month',
      'Month (YYYY-MM)': 'month',
      'Basic Salary': 'basic',
      'Basic': 'basic',
      'HRA': 'hra',
      'Allowance': 'allowance',
      'Bonus': 'bonus',
      'PF Contribution': 'pf',
      'PF': 'pf',
      'Income Tax': 'tax',
      'Tax': 'tax',
      'Net Pay': 'netPay',
      'Status': 'status',
      'Payment Date': 'paymentDate',
      'Payment Date (YYYY-MM-DD)': 'paymentDate',
      'Currency': 'currency'
    }
  }
  // Future entities (Candidates, Departments, etc.) can be added here
};

/**
 * Maps Excel rows to generic objects matching the entity schema.
 * 
 * @param {Array<Object>} rows - Array of parsed Excel rows
 * @param {String} entity - The entity being imported (e.g., 'users', 'employees')
 * @returns {Object} - { mappedData: Array, importedColumns: Array, ignoredColumns: Array }
 */
const mapColumns = (rows, entity) => {
  if (!schemas[entity]) {
    throw new Error(`Schema for entity '${entity}' is not defined.`);
  }

  const { fields, aliases } = schemas[entity];

  if (rows.length === 0) {
    return { mappedData: [], importedColumns: [], ignoredColumns: [] };
  }

  // Identify all headers in the Excel file
  const excelHeaders = Object.keys(rows[0]);

  // Track columns
  const importedColumns = new Set();
  const ignoredColumns = new Set();

  // Build a fast lookup map for current headers — case-insensitive alias matching
  const headerMap = {};
  // Build a lowercase alias lookup for case-insensitive matching
  const lowerAliases = {};
  Object.entries(aliases).forEach(([alias, field]) => {
    lowerAliases[alias.trim().toLowerCase()] = field;
  });

  excelHeaders.forEach(header => {
    const trimmedHeader = header.trim();
    const trimmedLower = trimmedHeader.toLowerCase();
    // Check if it's an exact match to a field
    if (fields.includes(trimmedHeader)) {
      headerMap[header] = trimmedHeader;
      importedColumns.add(header);
    }
    // Check alias — case-insensitive
    else if (lowerAliases[trimmedLower] && fields.includes(lowerAliases[trimmedLower])) {
      headerMap[header] = lowerAliases[trimmedLower];
      importedColumns.add(header);
    }
    // Otherwise it's ignored
    else {
      ignoredColumns.add(header);
    }
  });

  // Map the data
  const mappedData = rows.map(row => {
    const newObj = {};
    Object.keys(row).forEach(key => {
      if (headerMap[key]) {
        newObj[headerMap[key]] = row[key];
      }
    });
    return newObj;
  });

  return {
    mappedData,
    importedColumns: Array.from(importedColumns),
    ignoredColumns: Array.from(ignoredColumns)
  };
};

module.exports = {
  schemas,
  mapColumns
};
