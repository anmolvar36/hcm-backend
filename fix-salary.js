const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { email: 'candidate@hcm.ai' }
  });
  if (!users.length) return console.log('User not found');
  const u = users[0];

  const emp = await prisma.employeeProfile.findUnique({
    where: { userId: u.id }
  });
  if (!emp) return console.log('Employee profile not found');

  const app = await prisma.jobApplication.findFirst({
    where: { candidate: { userId: u.id } },
    orderBy: { submittedAt: 'desc' }
  });

  if (!app) return console.log('No job application');

  const offer = await prisma.offer.findFirst({
    where: { applicationId: app.id, status: 'Accepted' },
    orderBy: { createdAt: 'desc' }
  });

  if (!offer || !offer.salary) return console.log('No offer or salary');

  let isAnnual = /annual|year|pa|p\.a|y/i.test(offer.salary);
  let isMonthly = /month|pm|p\.m|mo/i.test(offer.salary);
  
  const match = offer.salary.replace(/,/g, '').match(/[\d.]+/);
  let amount = match ? parseFloat(match[0]) : 0;
  
  if (/k/i.test(offer.salary) && amount < 1000) amount *= 1000;
  if (/lakh|lpa|l/i.test(offer.salary) && amount < 1000) amount *= 100000;

  if (!isAnnual && !isMonthly) {
     if (amount > 20000) isAnnual = true;
     else isMonthly = true;
  }

  let monthlyCTC = isAnnual ? amount / 12 : amount;
  let annualCTC = isAnnual ? amount : amount * 12;

  await prisma.compensationProfile.upsert({
    where: { employeeId: emp.id },
    update: {
      monthlyCTC,
      annualCTC,
      baseSalary: monthlyCTC
    },
    create: {
      employeeId: emp.id,
      monthlyCTC,
      annualCTC,
      baseSalary: monthlyCTC,
      effectiveDate: new Date()
    }
  });

  console.log('Successfully updated compensation for', u.email, 'to monthlyCTC:', monthlyCTC);
}

main().finally(() => prisma.$disconnect());
