const prisma = require('../config/prisma');

exports.getAllCalendars = async (req, res, next) => {
  try {
    const calendars = await prisma.workCalendar.findMany({
      include: {
        versions: {
          include: {
            weekends: true
          },
          orderBy: { versionNumber: 'desc' },
          take: 1
        },
        assignments: true,
        holidays: true
      }
    });
    res.json({ success: true, data: calendars });
  } catch (err) {
    next(err);
  }
};

exports.getCalendarById = async (req, res, next) => {
  try {
    const calendar = await prisma.workCalendar.findUnique({
      where: { id: req.params.id },
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
    if (!calendar) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: calendar });
  } catch (err) {
    next(err);
  }
};

exports.createCalendar = async (req, res, next) => {
  try {
    const { name, description, timezone, weekends } = req.body;
    
    // Create calendar and initial version
    const calendar = await prisma.workCalendar.create({
      data: {
        name,
        description,
        timezone: timezone || 'UTC',
        versions: {
          create: {
            versionNumber: 1,
            weekends: {
              create: weekends || [] // e.g., [{ dayOfWeek: 'SATURDAY', type: 'FULL_DAY' }]
            }
          }
        }
      },
      include: {
        versions: { include: { weekends: true } }
      }
    });

    res.status(201).json({ success: true, data: calendar });
  } catch (err) {
    next(err);
  }
};

exports.updateCalendar = async (req, res, next) => {
  try {
    const { name, description, timezone, status, weekends } = req.body;
    
    // Simple update: We just update the calendar metadata and override the current version's weekends.
    // A robust versioning approach would create a new version here instead.
    const calendar = await prisma.workCalendar.update({
      where: { id: req.params.id },
      data: { name, description, timezone, status }
    });

    if (weekends) {
      // Find latest version
      const latestVersion = await prisma.workCalendarVersion.findFirst({
        where: { calendarId: req.params.id },
        orderBy: { versionNumber: 'desc' }
      });

      if (latestVersion) {
        // Delete old weekends and insert new ones
        await prisma.workCalendarWeekend.deleteMany({
          where: { versionId: latestVersion.id }
        });
        await prisma.workCalendarWeekend.createMany({
          data: weekends.map(w => ({ ...w, versionId: latestVersion.id }))
        });
      }
    }

    const updatedCalendar = await prisma.workCalendar.findUnique({
      where: { id: req.params.id },
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

    res.json({ success: true, data: updatedCalendar });
  } catch (err) {
    next(err);
  }
};

exports.deleteCalendar = async (req, res, next) => {
  try {
    await prisma.workCalendar.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.assignCalendar = async (req, res, next) => {
  try {
    const { calendarId, entityType, entityId, effectiveFrom } = req.body;
    
    const assignment = await prisma.workCalendarAssignment.create({
      data: {
        calendarId,
        entityType,
        entityId,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date()
      }
    });

    res.status(201).json({ success: true, data: assignment });
  } catch (err) {
    next(err);
  }
};

exports.removeAssignment = async (req, res, next) => {
  try {
    await prisma.workCalendarAssignment.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
