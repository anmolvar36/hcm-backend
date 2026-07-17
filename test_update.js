const axios = require('axios');
async function test() {
  try {
    // Need a valid token or just test the DB logic directly
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Find calendar
    const cals = await prisma.workCalendar.findMany();
    const id = cals[0].id;

    // Simulate update
    const weekends = [{ dayOfWeek: "MONDAY", type: "HALF_DAY" }];
    
    const latestVersion = await prisma.workCalendarVersion.findFirst({
        where: { calendarId: id },
        orderBy: { versionNumber: 'desc' }
    });

    await prisma.workCalendarWeekend.deleteMany({
        where: { versionId: latestVersion.id }
    });
    await prisma.workCalendarWeekend.createMany({
        data: weekends.map(w => ({ ...w, versionId: latestVersion.id }))
    });

    const updatedCalendar = await prisma.workCalendar.findUnique({
      where: { id: id },
      include: {
        versions: {
          include: {
            weekends: true
          },
          orderBy: { versionNumber: 'desc' }
        },
        assignments: true,
        holidays: true
      }
    });
    console.log(JSON.stringify(updatedCalendar, null, 2));
  } catch (e) { console.error(e); }
}
test();
