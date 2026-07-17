const prisma = require('../config/prisma');

class CalendarResolver {
  /**
   * Resolves the effective work calendar for an employee.
   * Priority: Employee -> Shift -> Department -> Location -> Company Default
   * @param {string} employeeId 
   * @param {Date} targetDate 
   */
  async getEffectiveCalendarForEmployee(employeeId, targetDate = new Date()) {
    // 1. Fetch employee with relations
    const employee = await prisma.employeeProfile.findUnique({
      where: { id: employeeId },
      include: {
        department: true,
        // Assuming location is a string on employee or we have to query differently based on actual schema.
        // For this generic approach, we'll fetch assignments for this employee directly.
      }
    });

    if (!employee) throw new Error('Employee not found');

    // 2. Fetch all assignments that might apply
    // In a highly optimized system, we would cache this or query specifically.
    const potentialAssignments = await prisma.workCalendarAssignment.findMany({
      where: {
        OR: [
          { entityType: 'EMPLOYEE', entityId: employeeId },
          { entityType: 'DEPARTMENT', entityId: employee.departmentId || 'none' },
          { entityType: 'SHIFT', entityId: employee.shiftId || 'none' },
          { entityType: 'LOCATION', entityId: employee.location || 'none' }
        ],
        effectiveFrom: { lte: targetDate },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: targetDate } }
        ]
      },
      include: {
        calendar: {
          include: {
            versions: {
              where: {
                effectiveFrom: { lte: targetDate },
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gte: targetDate } }
                ]
              },
              include: {
                weekends: true
              }
            },
            holidays: true
          }
        }
      }
    });

    // 3. Resolve Priority
    const assignedByEmployee = potentialAssignments.find(a => a.entityType === 'EMPLOYEE');
    if (assignedByEmployee) return this.extractActiveVersion(assignedByEmployee.calendar);

    const assignedByShift = potentialAssignments.find(a => a.entityType === 'SHIFT');
    if (assignedByShift) return this.extractActiveVersion(assignedByShift.calendar);

    const assignedByDepartment = potentialAssignments.find(a => a.entityType === 'DEPARTMENT');
    if (assignedByDepartment) return this.extractActiveVersion(assignedByDepartment.calendar);

    const assignedByLocation = potentialAssignments.find(a => a.entityType === 'LOCATION');
    if (assignedByLocation) return this.extractActiveVersion(assignedByLocation.calendar);

    // 4. Fallback to Company Default
    const defaultCalendar = await prisma.workCalendar.findFirst({
      where: { isDefaultCompanyCalendar: true },
      include: {
        versions: {
          where: {
            effectiveFrom: { lte: targetDate },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: targetDate } }
            ]
          },
          include: {
            weekends: true
          }
        },
        holidays: true
      }
    });

    if (defaultCalendar) return this.extractActiveVersion(defaultCalendar);

    throw new Error('No valid Work Calendar could be resolved.');
  }

  extractActiveVersion(calendar) {
    const activeVersion = calendar.versions[0]; // the query already filtered for the active one
    return {
      calendarId: calendar.id,
      name: calendar.name,
      timezone: calendar.timezone,
      versionNumber: activeVersion?.versionNumber || 1,
      weekends: activeVersion?.weekends || [],
      holidays: calendar.holidays || []
    };
  }

  /**
   * Determine if a given date is a working day, weekend, or holiday.
   * @param {string} employeeId 
   * @param {Date} date 
   */
  async getDayType(employeeId, date) {
    const calendar = await this.getEffectiveCalendarForEmployee(employeeId, date);
    
    // Check Holidays
    // Normalize date to YYYY-MM-DD
    const dateString = date.toISOString().split('T')[0];
    const isHoliday = calendar.holidays.find(h => h.date === dateString);
    if (isHoliday) {
      return { type: 'HOLIDAY', detail: isHoliday };
    }

    // Check Weekends
    const daysOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dayName = daysOfWeek[date.getDay()];

    const weekendRule = calendar.weekends.find(w => w.dayOfWeek === dayName);
    if (weekendRule) {
      return { type: 'WEEKEND', detail: weekendRule };
    }

    return { type: 'WORKING_DAY' };
  }
}

module.exports = new CalendarResolver();
