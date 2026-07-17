const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userId = '180986b8-d661-4a15-8d60-a2d3219c74c7';
  
  // Clear existing logs for July for Bob Marley
  await prisma.attendanceLog.deleteMany({
    where: {
      userId,
      date: {
        gte: new Date('2026-07-01'),
        lte: new Date('2026-07-17')
      }
    }
  });

  const logsToCreate = [];
  
  // July 1 to July 17
  for (let day = 1; day <= 17; day++) {
    const d = new Date(`2026-07-${day.toString().padStart(2, '0')}T00:00:00Z`);
    const dayOfWeek = d.getDay();
    
    // Skip Sundays
    if (dayOfWeek === 0) continue;
    
    // Skip July 8th (Wednesday) just to have 1 random absence
    if (day === 8) continue;

    // Is Saturday? Half day.
    const isHalfDay = dayOfWeek === 6;

    let clockInTime = new Date(`2026-07-${day.toString().padStart(2, '0')}T09:00:00Z`);
    let clockOutTime = new Date(`2026-07-${day.toString().padStart(2, '0')}T${isHalfDay ? '13' : '17'}:00:00Z`);

    // Add some random late minutes and overtimes
    let lateMinutes = 0;
    let overtimeMinutes = 0;

    if (day === 2) { // July 2nd: late
      clockInTime = new Date(`2026-07-${day.toString().padStart(2, '0')}T09:30:00Z`);
      lateMinutes = 30;
    }
    if (day === 10) { // July 10th: overtime
      clockOutTime = new Date(`2026-07-${day.toString().padStart(2, '0')}T19:00:00Z`);
      overtimeMinutes = 120; // 2 hours
    }

    logsToCreate.push({
      userId,
      date: d,
      clockIn: clockInTime,
      clockOut: clockOutTime,
      isHalfDay,
      status: lateMinutes > 0 ? 'Late' : 'Present',
      lateMinutes,
      earlyExitMinutes: 0,
      overtimeMinutes
    });
  }

  await prisma.attendanceLog.createMany({ data: logsToCreate });
  console.log(`Created ${logsToCreate.length} attendance logs for Bob Marley.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
