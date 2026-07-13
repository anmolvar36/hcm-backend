const prisma = require('./src/config/prisma');

async function run() {
  const depts = await prisma.department.findMany({ take: 5 });
  console.log('Departments:', depts.length, JSON.stringify(depts.map(d => d.name)));

  const candidates = await prisma.candidateProfile.findMany({ take: 5 });
  console.log('Candidates:', candidates.length, JSON.stringify(candidates.map(c => c.fullName)));

  const attendance = await prisma.attendanceLog.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log('Attendance:', attendance.length);

  const leave = await prisma.leaveRequest.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log('Leave:', leave.length);

  const payslips = await prisma.payslip.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log('Payslips:', payslips.length);

  const users = await prisma.user.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log('Users:', users.length, JSON.stringify(users.map(u => ({ email: u.email, role: u.role }))));

  const employees = await prisma.employeeProfile.findMany({ take: 5 });
  console.log('Employees:', employees.length, JSON.stringify(employees.map(e => e.fullName)));

  await prisma.$disconnect();
}

run();
