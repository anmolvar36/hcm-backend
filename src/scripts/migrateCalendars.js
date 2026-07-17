const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting Calendar Migration...');

  // 1. Get or create a default organization if none exists to link the calendar
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Default Company',
        email: 'admin@company.com'
      }
    });
    console.log('Created default organization');
  }

  // 2. Check if a default calendar already exists
  let defaultCalendar = await prisma.workCalendar.findFirst({
    where: { isDefaultCompanyCalendar: true }
  });

  if (!defaultCalendar) {
    // Create Default Calendar
    defaultCalendar = await prisma.workCalendar.create({
      data: {
        name: 'Company Default Calendar',
        description: 'The default work calendar for the company, automatically assigned to all employees unless overridden.',
        companyId: org.id,
        isDefaultCompanyCalendar: true,
        timezone: 'UTC',
        status: 'Active'
      }
    });
    console.log('Created Default Company Calendar:', defaultCalendar.id);

    // Create Initial Version
    const version = await prisma.workCalendarVersion.create({
      data: {
        calendarId: defaultCalendar.id,
        versionNumber: 1,
        effectiveFrom: new Date('2000-01-01T00:00:00.000Z') // Applicable from the past
      }
    });
    console.log('Created Calendar Version 1:', version.id);

    // Add Default Weekends (Saturday and Sunday FULL_DAY)
    await prisma.workCalendarWeekend.createMany({
      data: [
        { versionId: version.id, dayOfWeek: 'SATURDAY', type: 'FULL_DAY' },
        { versionId: version.id, dayOfWeek: 'SUNDAY', type: 'FULL_DAY' }
      ]
    });
    console.log('Added default weekend rules (Saturday, Sunday)');
  }

  // 3. Migrate existing holidays to the default calendar
  const existingHolidays = await prisma.holiday.findMany({
    where: { calendarId: null }
  });

  if (existingHolidays.length > 0) {
    console.log(`Found ${existingHolidays.length} existing holidays. Migrating to default calendar...`);
    
    for (const holiday of existingHolidays) {
      // Map string type to enum if possible
      let mappedType = 'PUBLIC';
      if (holiday.type) {
        const t = holiday.type.toUpperCase();
        if (['PUBLIC', 'COMPANY', 'REGIONAL', 'OPTIONAL'].includes(t)) {
          mappedType = t;
        }
      }

      await prisma.holiday.update({
        where: { id: holiday.id },
        data: { 
          calendarId: defaultCalendar.id,
          type: mappedType
        }
      });
    }
    console.log('Successfully migrated all existing holidays.');
  } else {
    console.log('No unassigned holidays found to migrate.');
  }

  console.log('Migration completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
