const prisma = require('../config/prisma');
const calendarResolver = require('./calendarResolver');
const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
dayjs.extend(isBetween);

class PayrollCalculator {
  async calculatePayroll(snapshot, employee, monthStr, orgIdParam) {
    const orgId = orgIdParam || employee.user?.organizationId || snapshot.employee?.user?.organizationId;
    if (!orgId) throw new Error("Organization ID missing");

    // 1. Fetch Policies
    const attendancePolicy = await prisma.attendancePolicy.findUnique({ where: { organizationId: orgId } });
    const leavePolicies = await prisma.leavePolicy.findMany({ where: { organizationId: orgId } });
    const overtimePolicy = employee.overtimePolicy;

    // 2. Set up month boundaries
    let startDate;
    if (/^\d{4}-\d{2}$/.test(monthStr)) {
      const [year, month] = monthStr.split('-');
      startDate = dayjs(`${year}-${month}-01`).startOf('month');
    } else {
      const parts = monthStr.split(' ');
      const monthName = parts[0];
      const yearStr = parts[1] || new Date().getFullYear();
      startDate = dayjs(new Date(`${monthName} 1, ${yearStr}`)).startOf('month');
    }
    let endDate = startDate.endOf('month');
    if (endDate.isAfter(dayjs())) {
      endDate = dayjs().endOf('day'); // Cap calculation to today for ongoing months
    }
    const daysToIterate = endDate.date();

    // 3. Resolve Work Calendar and Calculate Working Days
    let calendar;
    try {
      calendar = await calendarResolver.getEffectiveCalendarForEmployee(employee.id, startDate.toDate());
    } catch (e) {
      console.warn(`[Leave Calendar Warning] Failed to resolve calendar for ${employee.id}, defaulting to standard 30 days.`);
    }

    let totalWorkingDays = 0;
    const dayTypes = {};

    const checkDateLocal = (cal, date) => {
      const dateString = date.toISOString().split('T')[0];
      const isHoliday = cal.holidays?.find(h => h.date === dateString);
      if (isHoliday) return { type: 'HOLIDAY', detail: isHoliday };

      const daysOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const dayName = daysOfWeek[date.getDay()];
      const weekendRule = cal.weekends?.find(w => w.dayOfWeek === dayName);
      if (weekendRule) return { type: 'WEEKEND', detail: weekendRule };

      return { type: 'WORKING_DAY' };
    };

    if (calendar) {
      for (let i = 1; i <= daysToIterate; i++) {
        const currentDate = startDate.date(i).toDate();
        const check = checkDateLocal(calendar, currentDate);
        dayTypes[i] = check;
        if (check.type === 'WORKING_DAY') {
          totalWorkingDays += 1;
        } else if (check.type === 'WEEKEND' && check.detail?.type === 'HALF_DAY') {
          totalWorkingDays += 0.5;
        }
      }
    } else {
      totalWorkingDays = daysToIterate; // fallback
    }

    // Per day salary basis
    const monthlyCTC = snapshot.monthlyCTC || 0;
    const perDaySalary = totalWorkingDays > 0 ? (monthlyCTC / totalWorkingDays) : 0;
    const hourlyRate = (perDaySalary / 8); // Assuming 8 hour work day standard

    // 4. Fetch Attendance Logs
    const attendanceLogs = await prisma.attendanceLog.findMany({
      where: {
        userId: employee.userId,
        date: {
          gte: startDate.toDate(),
          lte: endDate.toDate()
        }
      }
    });

    let presentDays = 0;
    let totalLateMinutes = 0;
    let totalEarlyExitMinutes = 0;
    let totalOvertimeMinutes = 0;

    const dailyLogs = {};
    attendanceLogs.forEach(log => {
      const dateStr = log.date.toISOString().split('T')[0];
      if (!dailyLogs[dateStr]) dailyLogs[dateStr] = [];
      dailyLogs[dateStr].push(log);
    });

    Object.values(dailyLogs).forEach(logsForDay => {
      // Basic present logic - if clocked in at least once
      const isPresent = logsForDay.some(l => l.clockIn);
      const isHalfDay = logsForDay.some(l => l.isHalfDay);
      
      if (isPresent) presentDays += (isHalfDay ? 0.5 : 1);
      
      totalLateMinutes += logsForDay.reduce((acc, l) => acc + (l.lateMinutes || 0), 0);
      totalEarlyExitMinutes += logsForDay.reduce((acc, l) => acc + (l.earlyExitMinutes || 0), 0);
      totalOvertimeMinutes += logsForDay.reduce((acc, l) => acc + (l.overtimeMinutes || 0), 0);
    });

    // 5. Evaluate Attendance Penalties (LOP)
    let penaltyLopDays = 0;
    if (attendancePolicy) {
      const lateMarks = Math.floor(totalLateMinutes / attendancePolicy.lateMarkThresholdMin);
      if (lateMarks >= attendancePolicy.lateMarksForHalfDay) {
        penaltyLopDays += 0.5 * Math.floor(lateMarks / attendancePolicy.lateMarksForHalfDay);
      }
      
      const earlyMarks = Math.floor(totalEarlyExitMinutes / attendancePolicy.earlyExitThresholdMin);
      if (earlyMarks >= attendancePolicy.earlyExitsForHalfDay) {
        penaltyLopDays += 0.5 * Math.floor(earlyMarks / attendancePolicy.earlyExitsForHalfDay);
      }
    }

    // 6. Evaluate Overtime
    let overtimeHours = 0;
    let overtimeAmount = 0;
    if (overtimePolicy && totalOvertimeMinutes >= overtimePolicy.minOvertimeMin) {
       let cappedMinutes = Math.min(totalOvertimeMinutes, overtimePolicy.maxOvertimeMin);
       overtimeHours = cappedMinutes / 60;
       // Simplified multiplier assumption
       overtimeAmount = overtimeHours * hourlyRate * overtimePolicy.weekdayMultiplier;
    }

    // 7. Evaluate Leaves
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        userId: employee.userId,
        status: 'APPROVED',
        startDate: { lte: endDate.toDate() },
        endDate: { gte: startDate.toDate() }
      }
    });

    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;

    leaveRequests.forEach(leave => {
      // Find overlap
      let current = dayjs(leave.startDate) < startDate ? startDate : dayjs(leave.startDate);
      let end = dayjs(leave.endDate) > endDate ? endDate : dayjs(leave.endDate);

      let actualLeaveDaysInMonth = 0;
      while (current.isBefore(end) || current.isSame(end, 'day')) {
         const dNum = current.date();
         // Sandwich rule disabled: skip weekends/holidays
         const dayType = calendar ? dayTypes[dNum] : { type: 'WORKING_DAY' };
         if (dayType.type === 'WORKING_DAY') {
            actualLeaveDaysInMonth += 1;
         } else if (dayType.type === 'WEEKEND' && dayType.detail?.isHalfDay) {
            actualLeaveDaysInMonth += 0.5;
         }
         current = current.add(1, 'day');
      }

      const policy = leavePolicies.find(p => p.name === leave.leaveType);
      if (policy && policy.isPaid) {
        paidLeaveDays += actualLeaveDaysInMonth;
      } else {
        unpaidLeaveDays += actualLeaveDaysInMonth;
      }
    });

    // Absences not covered by leave
    let unexcusedAbsences = Math.max(0, totalWorkingDays - (presentDays + paidLeaveDays + unpaidLeaveDays));
    unpaidLeaveDays += unexcusedAbsences; // Treat as LOP

    // 8. Calculate Final Deductions & Earnings
    const totalLopDays = unpaidLeaveDays + penaltyLopDays;
    const lopDeductionAmount = totalLopDays * perDaySalary;

    return {
      totalWorkingDays,
      presentDays,
      paidLeaveDays,
      unpaidLeaveDays: totalLopDays,
      overtimeHours,
      overtimeAmount,
      lopDeductionAmount
    };
  }
}

module.exports = new PayrollCalculator();
