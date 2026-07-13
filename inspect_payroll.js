const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const employee = await prisma.employeeProfile.findFirst({
    where: { fullName: { contains: 'Bob' } },
    include: {
      compensationProfile: {
        include: {
          salaryBand: true
        }
      },
      payrollSnapshots: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          items: true
        }
      }
    }
  });

  console.log('--- Employee & Compensation Profile ---');
  console.log(JSON.stringify(employee, null, 2));

  if (employee && employee.compensationProfile && employee.compensationProfile.salaryVersionId) {
    const version = await prisma.salaryStructureVersion.findUnique({
      where: { id: employee.compensationProfile.salaryVersionId },
      include: {
        components: {
          include: { component: true },
          orderBy: { sequence: 'asc' }
        }
      }
    });
    console.log('--- Salary Structure Version Components ---');
    console.log(JSON.stringify(version, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
