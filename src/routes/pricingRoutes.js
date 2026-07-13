const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');

const {
  getPricingPlans,
  getPricingPlanById,
  createPricingPlan,
  updatePricingPlan,
  deletePricingPlan,
  togglePricingPlanStatus,
  reorderPricingPlans
} = require('../controllers/pricingController');

// Public endpoints (no protection required)
router.get('/', getPricingPlans);
router.get('/:id', getPricingPlanById);

// Protected endpoints (SuperAdmin only)
router.post('/', protect, authorize('SUPERADMIN'), createPricingPlan);
router.put('/reorder', protect, authorize('SUPERADMIN'), reorderPricingPlans);
router.put('/:id', protect, authorize('SUPERADMIN'), updatePricingPlan);
router.delete('/:id', protect, authorize('SUPERADMIN'), deletePricingPlan);
router.patch('/:id/status', protect, authorize('SUPERADMIN'), togglePricingPlanStatus);

module.exports = router;
