const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generatePayrollSnapshot } = require('./src/services/payrollEngineService');

async function main() {
  const employee = await prisma.employeeProfile.findFirst({
    where: { fullName: { contains: 'Bob' } }
  });

  if (!employee) {
    console.error('Employee Bob Marley not found');
    return;
  }

  const compensation = await prisma.compensationProfile.findUnique({
    where: { employeeId: employee.id }
  });

  console.log('Running test payroll snapshot generation for month "July" for Bob Marley...');
  const snapshot = await generatePayrollSnapshot(employee.id, 'July', compensation.organizationId || 'a64605c8-3b47-4c57-9e5c-243d87af5090');

  console.log('--- Snapshot Result ---');
  console.log('Gross:', snapshot.grossSalary);
  console.log('Deductions:', snapshot.totalDeductions);
  console.log('Net:', snapshot.netSalary);
  console.log('Employer Cost:', snapshot.employerCost);
  
  console.log('--- Calculation Items ---');
  console.log(snapshot.items);

  console.log('--- Calculation Log ---');
  const logs = JSON.parse(snapshot.calculationLog);
  logs.forEach(l => console.log(l));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
