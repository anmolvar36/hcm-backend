const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, getMasterCurrency, updateMasterCurrency } = require('../controllers/settingsController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/master-currency', getMasterCurrency);
router.put('/master-currency', protect, authorize('SUPERADMIN'), updateMasterCurrency);

router.get('/', getSettings); // Public/Authenticated GET
router.put('/', protect, authorize('SUPERADMIN', 'ADMIN'), updateSettings);

module.exports = router;
