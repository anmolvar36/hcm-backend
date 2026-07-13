const { parseExcelBuffer, generateTemplate } = require('../utils/excelParser');
const { mapColumns, schemas } = require('../utils/columnMapper');
const { validateData } = require('../utils/validator');
const { executeImport } = require('../services/importService');

const downloadTemplate = (req, res, next) => {
  try {
    const { entity } = req.params;
    if (!schemas[entity]) {
      return res.status(400).json({ success: false, message: 'Invalid entity type' });
    }

    const headers = schemas[entity].templateHeaders || schemas[entity].fields;
    const buffer = generateTemplate(headers);

    res.setHeader('Content-Disposition', `attachment; filename="${entity}_template.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to fuzzy match employee (duplicate logic from importService for preview)
function findEmployeeByFuzzyId(userIdVal, allEmployees) {
  if (!userIdVal) return null;
  const cleanId = String(userIdVal).trim().toLowerCase();
  
  let match = allEmployees.find(emp => 
    emp.userId.toLowerCase() === cleanId || 
    emp.id.toLowerCase() === cleanId ||
    (emp.employeeId && emp.employeeId.toLowerCase() === cleanId)
  );
  if (match) return match;

  match = allEmployees.find(emp => 
    emp.user?.email.toLowerCase() === cleanId
  );
  if (match) return match;

  return null;
}

const previewImport = async (req, res, next) => {
  try {
    const { entity } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    if (!schemas[entity]) {
      return res.status(400).json({ success: false, message: 'Invalid entity type' });
    }

    // 1. Parse Excel
    const rows = parseExcelBuffer(req.file.buffer);

    // 2. Map Columns (extract only what we need, ignore extras)
    const { mappedData, importedColumns, ignoredColumns } = mapColumns(rows, entity);

    // 3. Validate Basic Schema
    let { validRows, invalidRows, errors } = validateData(mappedData, entity);

    // 4. Validate Employee Existence (for relational imports)
    if (['leave', 'attendance', 'payroll'].includes(entity)) {
      const allEmployees = await prisma.employeeProfile.findMany({ include: { user: true } });
      const newValidRows = [];

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const idField = entity === 'payroll' ? row.employeeId : row.userId;
        const employee = findEmployeeByFuzzyId(idField, allEmployees);
        
        if (!employee) {
          invalidRows.push(row);
          errors.push({
            row: i + 2,
            column: entity === 'payroll' ? 'employeeId' : 'userId',
            error: `Employee not found for ID: ${idField}`
          });
        } else {
          newValidRows.push(row);
        }
      }
      validRows = newValidRows;
    }

    // 5. Check for duplicate users/employees (by email)
    if (entity === 'users' || entity === 'employees') {
      const newValidRows = [];
      const seenEmails = new Set();

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const email = String(row.email || '').trim().toLowerCase();

        if (!email) {
          invalidRows.push(row);
          errors.push({
            row: i + 2,
            column: 'email',
            error: 'Email is required'
          });
          continue;
        }

        // Check duplicate within the file itself
        if (seenEmails.has(email)) {
          invalidRows.push(row);
          errors.push({
            row: i + 2,
            column: 'email',
            error: `Duplicate email in file: ${email}`
          });
          continue;
        }
        seenEmails.add(email);

        // Check if user already exists in DB
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
          invalidRows.push(row);
          errors.push({
            row: i + 2,
            column: 'email',
            error: `User/Employee already exists with email: ${email}`
          });
          continue;
        }
        
        // Check if employeeId already exists in DB
        const empId = String(row.employeeId || '').trim();
        if (empId) {
          const existingProfile = await prisma.employeeProfile.findUnique({ where: { employeeId: empId } });
          if (existingProfile) {
            invalidRows.push(row);
            errors.push({
              row: i + 2,
              column: 'employeeId',
              error: `Employee ID already exists: ${empId}`
            });
            continue;
          }
        }
        
        newValidRows.push(row);
      }
      validRows = newValidRows;
    }

    // 6. Check for duplicate payroll (by employee + month)
    if (entity === 'payroll') {
      const allEmployees = await prisma.employeeProfile.findMany({ include: { user: true } });
      const newValidRows = [];
      const seenKeys = new Set();

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const employee = findEmployeeByFuzzyId(row.employeeId, allEmployees);
        if (!employee) continue; // already filtered above

        const month = row.month || new Date().toLocaleString('en-US', { month: 'long' });
        const key = `${employee.id}_${month}`;

        // Check duplicate within the file itself
        if (seenKeys.has(key)) {
          invalidRows.push(row);
          errors.push({
            row: i + 2,
            column: 'employeeId',
            error: `Duplicate payroll entry in file for ${row.employeeId} - ${month}`
          });
          continue;
        }
        seenKeys.add(key);

        // Check if payslip already exists in DB
        const existingPayslip = await prisma.payslip.findFirst({
          where: { employeeId: employee.id, month }
        });
        if (existingPayslip) {
          invalidRows.push(row);
          errors.push({
            row: i + 2,
            column: 'employeeId',
            error: `Payroll already exists for ${row.employeeId} - ${month}`
          });
        } else {
          newValidRows.push(row);
        }
      }
      validRows = newValidRows;
    }

    res.json({
      success: true,
      data: {
        totalRows: rows.length,
        importedColumns,
        ignoredColumns,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        errors,
        previewData: mappedData.slice(0, 5) // Send 5 rows for UI preview
      }
    });
  } catch (error) {
    next(error);
  }
};

// Shared helper: filters validRows through the same checks as preview
async function filterValidRows(validRows, entity) {
  if (['leave', 'attendance', 'payroll'].includes(entity)) {
    const allEmployees = await prisma.employeeProfile.findMany({ include: { user: true } });
    validRows = validRows.filter(row => {
      const idField = entity === 'payroll' ? row.employeeId : row.userId;
      return !!findEmployeeByFuzzyId(idField, allEmployees);
    });
  }

  if (entity === 'users' || entity === 'employees') {
    const seenEmails = new Set();
    const seenIds = new Set();
    const filtered = [];
    for (const row of validRows) {
      const email = String(row.email || '').trim().toLowerCase();
      const empId = String(row.employeeId || '').trim();
      
      if (!email || seenEmails.has(email)) continue;
      if (empId && seenIds.has(empId)) continue;
      
      seenEmails.add(email);
      if (empId) seenIds.add(empId);
      
      const existing = await prisma.user.findUnique({ where: { email } });
      let existingProfile = null;
      if (empId) {
        existingProfile = await prisma.employeeProfile.findUnique({ where: { employeeId: empId } });
      }
      
      if (!existing && !existingProfile) filtered.push(row);
    }
    validRows = filtered;
  }

  return validRows;
}

const processImport = async (req, res, next) => {
  try {
    const { entity } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const rows = parseExcelBuffer(req.file.buffer);
    const { mappedData } = mapColumns(rows, entity);
    let { validRows } = validateData(mappedData, entity);

    // Re-run the same validation as preview to filter out invalid rows
    validRows = await filterValidRows(validRows, entity);

    // Inject Context (from req.user assigned by auth middleware)
    const context = {
      organizationId: req.user ? req.user.organizationId : null,
      userId: req.user ? req.user.id : null
    };

    const result = await executeImport(validRows, entity, context);

    res.json({
      success: true,
      message: `Successfully imported ${result.count} records.`,
      count: result.count
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  downloadTemplate,
  previewImport,
  processImport
};
