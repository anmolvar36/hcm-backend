// ============================================================
// Org Chart Controller
// ============================================================
// Handles HTTP requests for the Organization Chart API.

const prisma = require('../config/prisma');
const { buildOrgChart } = require('../services/orgChartService');

/**
 * GET /api/admin/org-chart
 * Query params:
 *   - departmentId (optional) — load only a specific branch for lazy loading
 *
 * Returns a fully nested hierarchical tree ready for frontend rendering.
 */
const getOrgChart = async (req, res, next) => {
  try {
    // Resolve the user's organization
    let organizationId = req.user?.organizationId;
    if (!organizationId) {
      const defaultOrg = await prisma.organization.findFirst({ select: { id: true } });
      organizationId = defaultOrg?.id;
    }

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_ORGANIZATION', message: 'No organization configured.' },
      });
    }

    const { departmentId } = req.query;
    const result = await buildOrgChart(organizationId, departmentId || null);

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[getOrgChart] Error:', err.message);
    next(err);
  }
};

module.exports = { getOrgChart };
