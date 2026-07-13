const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const monthMap = {
  'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
  'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
};

async function backfill() {
  console.log('Starting backfill of legacy payslips into PayrollRuns...');

  const legacyPayslips = await prisma.payslip.findMany({
    where: { payrollRunId: null }
  });
  console.log(`Found ${legacyPayslips.length} legacy payslips to process.`);

  const byMonth = {};
  for (const p of legacyPayslips) {
    if (!byMonth[p.month]) byMonth[p.month] = [];
    byMonth[p.month].push(p);
  }

  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPERADMIN' } });
  const adminId = superAdmin ? superAdmin.id : null;

  for (const [monthStr, payslips] of Object.entries(byMonth)) {
    console.log(`Processing month: ${monthStr} with ${payslips.length} payslips.`);
    
    let year = 2026;
    let monthIndex = 0; // default to Jan
    
    if (monthStr.includes('-')) {
      const parts = monthStr.split('-');
      year = parseInt(parts[0]);
      monthIndex = parseInt(parts[1]) - 1;
    } else {
      const cleanMonth = monthStr.toLowerCase().trim();
      if (monthMap[cleanMonth] !== undefined) {
        monthIndex = monthMap[cleanMonth];
      }
    }

    const periodStart = new Date(year, monthIndex, 1);
    const periodEnd = new Date(year, monthIndex + 1, 0);

    let totalGross = 0, totalNet = 0, totalTaxes = 0;
    for (const p of payslips) {
      totalGross += (p.basic + (p.hra || 0) + p.allowance + (p.bonus || 0));
      totalNet += p.netPay;
      totalTaxes += (p.pf + p.tax);
    }

    const run = await prisma.payrollRun.create({
      data: {
        periodStart, periodEnd, payDate: new Date(), status: 'Disbursed',
        totalGross, totalNet, totalTaxes,
        generatedById: adminId, approvedById: adminId,
        approvedAt: new Date(), disbursedAt: new Date(),
      }
    });
    console.log(`Created PayrollRun ${run.id} for ${monthStr}. Linking payslips...`);
    
    for (const p of payslips) {
      await prisma.payslip.update({
        where: { id: p.id },
        data: { payrollRunId: run.id, status: 'Disbursed' }
      });
      await prisma.paymentTransaction.create({
        data: {
          payslipId: p.id, method: 'Legacy Data Backfill', status: 'Completed', executedAt: p.paymentDate || p.createdAt
        }
      });
    }
  }

  const employees = await prisma.employeeProfile.findMany({
    include: { user: true, compensation: true }
  });
  
  for (const emp of employees) {
    if (!emp.compensation) {
      const role = emp.user?.role || 'EMPLOYEE';
      let basic = 5000, allowance = 1000;
      if (role === 'MANAGER') { basic = 8000; allowance = 2000; }
      else if (role === 'SUPERADMIN') { basic = 10000; allowance = 2500; }

      await prisma.compensationStructure.create({
        data: {
          employeeId: emp.id, basic, hra: basic * 0.2, allowance, bonusEligible: true,
        }
      });
    }
  }
  console.log('Backfill completed successfully.');
}
backfill().catch(e => { console.error('Error:', e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
