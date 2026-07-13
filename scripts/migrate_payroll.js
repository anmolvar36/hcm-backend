const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  const orgs = await prisma.organization.findMany();
  for (const org of orgs) {
    // Create a legacy component
    const basicComp = await prisma.salaryComponent.upsert({
      where: { code: 'BASIC_LEGACY_' + org.id },
      update: {},
      create: {
        organizationId: org.id,
        name: 'Legacy Basic',
        code: 'BASIC_LEGACY_' + org.id,
        category: 'Earning',
        calculationType: 'Auto Balance',
        isAutoBalance: true,
        value: '0'
      }
    });

    // Create legacy structure
    let structure = await prisma.salaryStructure.findFirst({
      where: { organizationId: org.id, name: 'Legacy Structure' },
      include: { versions: true }
    });

    if (!structure) {
      structure = await prisma.salaryStructure.create({
        data: {
          organizationId: org.id,
          name: 'Legacy Structure',
          description: 'Auto-generated for legacy compensation records',
          versions: {
            create: {
              version: 1,
              components: {
                create: {
                  componentId: basicComp.id,
                  sequence: 999
                }
              }
            }
          }
        },
        include: { versions: true }
      });
      await prisma.salaryStructure.update({
        where: { id: structure.id },
        data: { currentVersionId: structure.versions[0].id }
      });
    }

    const versionId = structure.versions[0].id;

    // Update compensations
    const profiles = await prisma.compensationProfile.findMany({
      where: { employee: { user: { organizationId: org.id } } }
    });

    for (const profile of profiles) {
      if (!profile.salaryVersionId && profile.baseSalary) {
        await prisma.compensationProfile.update({
          where: { id: profile.id },
          data: {
            monthlyCTC: profile.baseSalary,
            salaryStructureId: structure.id,
            salaryVersionId: versionId
          }
        });
      }
    }
  }
  console.log('Migration complete');
}

migrate().catch(console.error).finally(() => prisma.$disconnect());
