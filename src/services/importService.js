const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

const DEFAULT_HASH = bcrypt.hashSync('defaultPassword123!', 10);
const CANDIDATE_DEFAULT_HASH = bcrypt.hashSync('candidateDefaultPassword123!', 10);

function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // Remove spaces, dots, dashes, etc.
}

function findEmployeeByFuzzyId(userIdVal, allEmployees) {
  if (!userIdVal) return null;
  const cleanId = String(userIdVal).trim().toLowerCase();
  
  // 1. Match by exact UUID or IDs
  let match = allEmployees.find(emp => 
    emp.userId.toLowerCase() === cleanId || 
    emp.id.toLowerCase() === cleanId ||
    (emp.employeeId && emp.employeeId.toLowerCase() === cleanId)
  );
  if (match) return match;

  // 2. Match by email
  match = allEmployees.find(emp => 
    emp.user?.email.toLowerCase() === cleanId
  );
  if (match) return match;

  // 3. Match by normalized name
  const normSearch = normalizeName(cleanId);
  match = allEmployees.find(emp => 
    normalizeName(emp.fullName) === normSearch ||
    (emp.user?.email && normalizeName(emp.user.email.split('@')[0]) === normSearch)
  );
  if (match) return match;

  return null;
}

function parseImportDate(dateInput) {
  if (!dateInput) return new Date();
  
  // If it's already a Date object
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    return dateInput;
  }
  
  // If it's a number (Excel serial number)
  if (typeof dateInput === 'number') {
    return new Date(Math.round((dateInput - 25569) * 86400 * 1000));
  }
  
  // If it's a string, clean it
  let str = String(dateInput).trim();
  
  // Try standard JS parsing first
  let parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Try parsing DD/MM/YYYY or DD-MM-YYYY
  const dmYRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const match = str.match(dmYRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-based
    const year = parseInt(match[3], 10);
    parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Try parsing YYYY/MM/DD
  const YmdRegex = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/;
  const matchY = str.match(YmdRegex);
  if (matchY) {
    const year = parseInt(matchY[1], 10);
    const month = parseInt(matchY[2], 10) - 1;
    const day = parseInt(matchY[3], 10);
    parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Fallback to today if all parsing fails
  return new Date();
}

/**
 * Handles the actual insertion of valid data into the database in chunks.
 * 
 * @param {Array<Object>} validData - The validated and mapped rows
 * @param {String} entity - e.g., 'users', 'employees'
 * @param {Object} context - Auth context (organizationId, userId, etc.)
 */
const executeImport = async (validData, entity, context) => {
  if (!validData || validData.length === 0) {
    return { success: true, count: 0 };
  }

  // Pre-process data based on entity to inject tenant info
  const processedData = validData.map(row => {
    const newRow = { ...row };
    // Inject multi-tenant data if applicable to the entity
    if (entity === 'users' || entity === 'employees' || entity === 'departments') {
      // In this system, user uses organizationId (Wait, User has organizationId, Employee doesn't directly but maybe via user)
      // For safety, only inject what exists in schema. Let's assume organizationId is needed for Department and User.
      if (entity === 'users') {
        newRow.organizationId = context.organizationId;
        // Provide defaults for user if missing
        newRow.passwordHash = newRow.passwordHash || 'defaultHash_please_change';
      }
    }
    return newRow;
  });

  const CHUNK_SIZE = 250;
  let totalInserted = 0;

  // Use Prisma Transaction for the chunks
  // Actually, createMany handles batch inserts.
  // We can do chunks to avoid memory/query limits on huge files.

  for (let i = 0; i < processedData.length; i += CHUNK_SIZE) {
    const chunk = processedData.slice(i, i + CHUNK_SIZE);

    try {
      if (entity === 'users') {
        for (const row of chunk) {
          try {
            const email = String(row.email || '').trim().toLowerCase();
            if (!email) continue;

            // Skip if user already exists
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
              console.warn(`Skipping duplicate user: ${email}`);
              continue;
            }

            await prisma.user.create({
              data: {
                ...row,
                email,
              }
            });
            totalInserted++;
          } catch (err) {
            console.error(`Failed to import user ${row.email}:`, err.message);
          }
        }
      } else if (entity === 'employees') {
        // Employees require User creation then EmployeeProfile creation
        for (const row of chunk) {
          try {
            const email = String(row.email || '').trim().toLowerCase();
            const empId = String(row.employeeId || '').trim();
            
            console.log(`[IMPORT] Processing employee: ${email}, employeeId: "${empId}"`);

            // First check if user already exists — skip duplicates
            let existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
              // Check if employee profile also exists — if so, this is a full duplicate, skip
              const existingProfile = await prisma.employeeProfile.findUnique({ where: { userId: existingUser.id } });
              if (existingProfile) {
                console.warn(`[IMPORT] Skipping duplicate employee: ${email} (profile already exists with empId: ${existingProfile.employeeId})`);
                continue;
              }
            }

            // Check if employeeId already exists in DB — skip to prevent unique constraint error
            if (empId) {
              const existingEmpId = await prisma.employeeProfile.findUnique({ where: { employeeId: empId } });
              if (existingEmpId) {
                console.warn(`[IMPORT] Skipping employee ${email}: Employee ID "${empId}" already exists in DB`);
                continue;
              }
            }

            // If no employeeId provided, we cannot safely create a profile — skip
            if (!empId) {
              console.warn(`[IMPORT] Skipping employee ${email}: no Employee ID provided in the file.`);
              continue;
            }

            // Resolve manager
            let managerIdToSet = null;
            if (row.manager) {
              const mgr = await prisma.employeeProfile.findFirst({
                where: {
                  OR: [
                    { id: row.manager },
                    { employeeId: row.manager },
                    { user: { email: row.manager } }
                  ]
                }
              });
              if (mgr) managerIdToSet = mgr.id;
            }

            // Use a transaction to ensure User + Profile are created atomically
            // If profile creation fails, the user creation rolls back too (no dangling users)
            await prisma.$transaction(async (tx) => {
              let user = existingUser;
              
              if (!user) {
                user = await tx.user.create({
                  data: {
                    email,
                    passwordHash: DEFAULT_HASH,
                    role: row.role?.toUpperCase() || 'EMPLOYEE',
                    status: row.status || 'Active',
                    organizationId: context.organizationId,
                  }
                });
                console.log(`[IMPORT] Created user: ${email} (id: ${user.id})`);
              }

              // Check if profile already exists (for existing users without profile)
              let employee = await tx.employeeProfile.findUnique({ where: { userId: user.id } });
              
              if (!employee) {
                employee = await tx.employeeProfile.create({
                  data: {
                    userId: user.id,
                    employeeId: empId,
                    fullName: row.fullName || row.firstName || 'Unknown',
                    phone: row.phone ? row.phone.toString().trim() : null,
                    employmentType: row.employmentType || 'Full-time',
                    joiningDate: row.joiningDate ? parseImportDate(row.joiningDate) : new Date(),
                    address: row.address,
                    bio: row.privateNotes || null,
                    managerId: managerIdToSet
                  }
                });
                console.log(`[IMPORT] Created profile: ${email} → employeeId: "${empId}"`);
              } else {
                employee = await tx.employeeProfile.update({
                  where: { id: employee.id },
                  data: {
                    employeeId: empId || employee.employeeId,
                    fullName: row.fullName || row.firstName || employee.fullName,
                    phone: row.phone ? row.phone.toString().trim() : employee.phone,
                    employmentType: row.employmentType || employee.employmentType,
                    joiningDate: row.joiningDate ? parseImportDate(row.joiningDate) : employee.joiningDate,
                    address: row.address || employee.address,
                    bio: row.privateNotes || employee.bio,
                    managerId: managerIdToSet || employee.managerId
                  }
                });
                console.log(`[IMPORT] Updated profile: ${email} → employeeId: "${employee.employeeId}"`);
              }

              // Create or update Compensation Profile if CTC is provided
              if (row.monthlyCTC !== undefined && row.monthlyCTC !== null && row.monthlyCTC !== '') {
                const cleanedCTC = row.monthlyCTC.toString().replace(/[^0-9.]/g, '');
                const mCtc = parseFloat(cleanedCTC) || 0;
                
                const existingComp = await tx.compensationProfile.findUnique({
                  where: { employeeId: employee.id }
                });

                // Fetch default or first available salary structure for the organization
                let defaultStructure = await tx.salaryStructure.findFirst({
                  where: { organizationId: context.organizationId, isDefault: true }
                });
                
                if (!defaultStructure) {
                  defaultStructure = await tx.salaryStructure.findFirst({
                    where: { organizationId: context.organizationId }
                  });
                }

                if (existingComp) {
                  await tx.compensationProfile.update({
                    where: { id: existingComp.id },
                    data: {
                      monthlyCTC: mCtc,
                      annualCTC: mCtc * 12,
                      effectiveDate: row.effectiveDate ? parseImportDate(row.effectiveDate) : existingComp.effectiveDate,
                      salaryStructureId: existingComp.salaryStructureId || (defaultStructure ? defaultStructure.id : null),
                      salaryVersionId: existingComp.salaryVersionId || (defaultStructure ? defaultStructure.currentVersionId : null),
                    }
                  });
                } else {
                  await tx.compensationProfile.create({
                    data: {
                      employeeId: employee.id,
                      monthlyCTC: mCtc,
                      annualCTC: mCtc * 12,
                      effectiveDate: row.effectiveDate ? parseImportDate(row.effectiveDate) : new Date(),
                      status: 'Active',
                      salaryStructureId: defaultStructure ? defaultStructure.id : null,
                      salaryVersionId: defaultStructure ? defaultStructure.currentVersionId : null,
                    }
                  });
                }
              }
            });

            totalInserted++;
          } catch (err) {
            console.error(`[IMPORT] FAILED to import employee ${row.email}:`, err.message);
          }
        }
      } else if (entity === 'candidates') {
        // Candidates require User creation first
        for (const row of chunk) {
          try {
            const email = row.email || `candidate-${Math.floor(Math.random() * 100000)}@org.com`;
            let user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
              user = await prisma.user.create({
                data: {
                  email,
                  passwordHash: CANDIDATE_DEFAULT_HASH,
                  role: 'CANDIDATE',
                  status: 'Active',
                  organizationId: context.organizationId,
                }
              });
            } else {
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  role: 'CANDIDATE',
                  status: 'Active',
                }
              });
            }

            let candidateProfile = await prisma.candidateProfile.findUnique({
              where: { userId: user.id }
            });

            const candidateData = {
              fullName: row.fullName || 'Unknown Candidate',
              phone: row.phone ? row.phone.toString().trim() : null,
              location: row.location,
              expectedSalary: row.expectedSalary ? row.expectedSalary.toString() : null,
              experience: row.experience ? row.experience.toString() : null,
              skills: row.skills,
              linkedin: row.linkedin,
              portfolio: row.portfolio
            };

            if (!candidateProfile) {
              candidateProfile = await prisma.candidateProfile.create({
                data: {
                  userId: user.id,
                  ...candidateData
                }
              });
            } else {
              candidateProfile = await prisma.candidateProfile.update({
                where: { id: candidateProfile.id },
                data: candidateData
              });
            }

            // Make sure they show up in the HR Pipeline by attaching them to a default job pool
            let defaultJob = await prisma.jobPost.findFirst({
              where: { title: 'General Talent Pool' }
            });
            
            if (!defaultJob) {
              defaultJob = await prisma.jobPost.create({
                data: {
                  title: 'General Talent Pool',
                  description: 'Candidates imported into the system without a specific application.',
                  requirements: 'Varies',
                  department: 'All'
                }
              });
            }

            // Check if they already have an application to this default job
            const existingApp = await prisma.jobApplication.findFirst({
              where: { jobId: defaultJob.id, candidateId: candidateProfile.id }
            });

            if (!existingApp) {
              await prisma.jobApplication.create({
                data: {
                  jobId: defaultJob.id,
                  candidateId: candidateProfile.id,
                  status: 'APPLIED'
                }
              });
            }
            totalInserted++;
          } catch (err) {
            console.error('Failed to import candidate:', err.message);
          }
        }
      } else if (entity === 'departments') {
        const mappedData = chunk.map(row => ({
          name: row.name || 'Unnamed Department',
          code: row.code || `DEPT-${Math.floor(Math.random() * 10000)}`,
          head: row.head,
          parent: row.parent || 'Corporate',
          description: row.description,
          color: row.color || '#4f46e5',
          status: row.status || 'Active',
          organizationId: context.organizationId,
        }));
        const res = await prisma.department.createMany({ data: mappedData, skipDuplicates: true });
        totalInserted += res.count;
      } else if (entity === 'attendance') {
        const batch = [];
        const allEmployees = await prisma.employeeProfile.findMany({ include: { user: true } });
        const processedSignatures = new Set();

        for (const row of chunk) {
          try {
            const employee = findEmployeeByFuzzyId(row.userId, allEmployees);
            if (!employee) {
              console.warn(`Employee not found for attendance import: ${row.userId}`);
              continue;
            }

            // If managerId is provided, try to update employee profile's manager
            if (row.managerId) {
              const manager = findEmployeeByFuzzyId(row.managerId, allEmployees);
              if (manager) {
                await prisma.employeeProfile.update({
                  where: { id: employee.id },
                  data: { managerId: manager.id }
                });
                employee.managerId = manager.id;
              }
            }

            const date = parseImportDate(row.date);
            let clockIn = row.clockIn ? parseImportDate(row.clockIn) : date;
            let clockOut = row.clockOut ? parseImportDate(row.clockOut) : null;
            let totalWorkedMin = 0;
            
            if (clockIn && clockOut) {
              totalWorkedMin = Math.round((clockOut.getTime() - clockIn.getTime()) / (1000 * 60));
            }
            
            // Check for duplicates in the current batch
            const signature = `${employee.userId}_${date.toISOString()}`;
            if (processedSignatures.has(signature)) {
              continue;
            }

            // Check for existing duplicates in the database
            const existingAttendance = await prisma.attendanceLog.findFirst({
              where: {
                userId: employee.userId,
                date: date
              }
            });

            if (existingAttendance) {
              continue;
            }

            processedSignatures.add(signature);

            batch.push({
              userId: employee.userId,
              date: date,
              clockIn: clockIn || date,
              clockOut: clockOut,
              totalWorkedMin: totalWorkedMin,
              status: row.status || 'Present',
              mode: row.mode || 'Office'
            });
          } catch (e) {
            console.error(`Failed to process attendance row:`, e.message);
          }
        }
        if (batch.length > 0) {
          const res = await prisma.attendanceLog.createMany({ data: batch, skipDuplicates: true });
          totalInserted += res.count;
        }
      } else if (entity === 'leave') {
        const batch = [];
        const allEmployees = await prisma.employeeProfile.findMany({ include: { user: true } });
        const processedSignatures = new Set();

        for (const row of chunk) {
          try {
            const employee = findEmployeeByFuzzyId(row.userId, allEmployees);
            if (!employee) {
              console.warn(`Employee not found for leave import: ${row.userId}`);
              continue;
            }

            // If managerId is provided, try to update employee profile's manager
            if (row.managerId) {
              const manager = findEmployeeByFuzzyId(row.managerId, allEmployees);
              if (manager) {
                await prisma.employeeProfile.update({
                  where: { id: employee.id },
                  data: { managerId: manager.id }
                });
                employee.managerId = manager.id;
              }
            }

            const start = parseImportDate(row.startDate);
            const end = row.endDate ? parseImportDate(row.endDate) : start;
            let totalDays = parseInt(row.totalDays);
            if (isNaN(totalDays)) {
              totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            }

            // Check for duplicates in the current batch
            const signature = `${employee.userId}_${start.toISOString()}_${end.toISOString()}_${row.leaveType}`;
            if (processedSignatures.has(signature)) {
              continue;
            }
            
            // Check for existing duplicates in the database
            const existingLeave = await prisma.leaveRequest.findFirst({
              where: {
                userId: employee.userId,
                startDate: start,
                endDate: end,
                leaveType: row.leaveType || 'Casual Leave'
              }
            });

            if (existingLeave) {
              continue;
            }

            processedSignatures.add(signature);

            batch.push({
              userId: employee.userId,
              leaveType: row.leaveType || 'Casual Leave',
              startDate: start,
              endDate: end,
              totalDays: totalDays > 0 ? totalDays : 1,
              reason: row.reason || '',
              status: row.status ? String(row.status).toUpperCase() : 'PENDING',
              managerComment: row.managerComment || '',
              emergencyContact: row.emergencyContact || ''
            });
          } catch (e) {
            console.error(`Failed to process leave row:`, e.message);
          }
        }
        if (batch.length > 0) {
          const res = await prisma.leaveRequest.createMany({ data: batch, skipDuplicates: true });
          totalInserted += res.count;
        }
      } else if (entity === 'payroll') {
        for (const row of chunk) {
          try {
            // Find employee profile by UUID or employeeId (e.g. EMP-001)
            const employee = await prisma.employeeProfile.findFirst({
              where: {
                OR: [
                  { id: row.employeeId },
                  { employeeId: row.employeeId }
                ]
              }
            });

            if (!employee) {
              console.warn(`Skipping payroll import: Employee not found for ID ${row.employeeId}`);
              continue;
            }

            const month = row.month || new Date().toLocaleString('en-US', { month: 'long' });
            const basic = parseFloat(row.basic) || 0;
            const hra = parseFloat(row.hra) || 0;
            const allowance = parseFloat(row.allowance) || 0;
            const bonus = parseFloat(row.bonus) || 0;
            const pf = parseFloat(row.pf) || 0;
            const tax = parseFloat(row.tax) || 0;
            const netPay = parseFloat(row.netPay) || (basic + hra + allowance + bonus - pf - tax);
            
            const rawStatus = row.status || 'Draft';
            const dbStatus = (rawStatus === 'Processed' || rawStatus === 'Paid') ? 'Paid' : 'Unpaid';
            const snapshotStatus = (rawStatus === 'Processed' || rawStatus === 'Paid') ? 'Paid' : 'Draft';
            
            // 1. Create or update legacy Payslip
            const existingPayslip = await prisma.payslip.findFirst({
              where: { employeeId: employee.id, month }
            });

            if (existingPayslip) {
              await prisma.payslip.update({
                where: { id: existingPayslip.id },
                data: { basic, hra, allowance, bonus, pf, tax, netPay, status: dbStatus, paymentDate: row.paymentDate ? new Date(row.paymentDate) : null }
              });
            } else {
              await prisma.payslip.create({
                data: {
                  employeeId: employee.id,
                  month,
                  basic,
                  hra,
                  allowance,
                  bonus,
                  pf,
                  tax,
                  netPay,
                  status: dbStatus,
                  paymentDate: row.paymentDate ? new Date(row.paymentDate) : null,
                  currency: row.currency || 'USD'
                }
              });
            }

            // 2. Create or update PayrollSnapshot for Admin UI
            const existingSnapshot = await prisma.payrollSnapshot.findFirst({
              where: { employeeId: employee.id, month }
            });

            const snapshotData = {
              employeeId: employee.id,
              month,
              monthlyCTC: basic + hra + allowance + bonus, // Simplified estimation
              grossSalary: basic + hra + allowance + bonus,
              totalDeductions: pf + tax,
              totalContributions: 0,
              netSalary: netPay,
              employerCost: basic + hra + allowance + bonus,
              status: snapshotStatus,
              paymentDate: row.paymentDate ? new Date(row.paymentDate) : null
            };

            let snapshot;
            if (existingSnapshot) {
              snapshot = await prisma.payrollSnapshot.update({
                where: { id: existingSnapshot.id },
                data: snapshotData
              });
              // Delete existing items to recreate
              await prisma.payrollItem.deleteMany({
                where: { snapshotId: snapshot.id }
              });
            } else {
              snapshot = await prisma.payrollSnapshot.create({
                data: snapshotData
              });
            }

            // 3. Create PayrollItems
            const items = [
              { name: 'Basic Salary', type: 'Earning', amount: basic },
              { name: 'HRA', type: 'Earning', amount: hra },
              { name: 'Allowance', type: 'Earning', amount: allowance },
              { name: 'Bonus', type: 'Earning', amount: bonus },
              { name: 'PF Contribution', type: 'Deduction', amount: pf },
              { name: 'Income Tax', type: 'Deduction', amount: tax }
            ].filter(item => item.amount > 0);

            if (items.length > 0) {
              await prisma.payrollItem.createMany({
                data: items.map(item => ({
                  snapshotId: snapshot.id,
                  name: item.name,
                  type: item.type,
                  amount: item.amount
                }))
              });
            }
            totalInserted++;
          } catch (err) {
            console.error(`Failed to import payroll row:`, err.message);
          }
        }
      } else if (entity === 'jobs') {
        for (const row of chunk) {
          try {
            if (!row.title) continue;

            const statusStr = row.status ? String(row.status).toLowerCase() : '';
            const isActive = row.status ? (statusStr === 'published' || statusStr === 'active' || statusStr === 'open') : true;

            await prisma.jobPost.create({
              data: {
                title: String(row.title),
                department: row.department ? String(row.department) : 'General',
                description: row.description ? String(row.description) : 'No description provided.',
                requirements: row.requirements ? String(row.requirements) : '',
                salaryRange: row.salaryRange ? String(row.salaryRange) : null,
                location: row.location ? String(row.location) : null,
                jobType: row.jobType ? String(row.jobType) : 'Full Time',
                experience: row.experience ? String(row.experience) : null,
                openings: row.openings ? parseInt(row.openings, 10) || 1 : 1,
                status: row.status ? String(row.status) : 'Published',
                isActive: isActive
              }
            });
            totalInserted++;
          } catch (err) {
            console.error(`Failed to import job row:`, err.message);
          }
        }
      }
    } catch (error) {
      console.error(`Chunk insertion failed for ${entity}:`, error);
      // We continue with next chunk instead of aborting everything (Partial Import Support)
    }
  }

  return { success: true, count: totalInserted };
};

module.exports = {
  executeImport
};
