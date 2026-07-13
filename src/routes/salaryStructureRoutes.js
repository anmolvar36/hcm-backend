const express = require('express');
const router = express.Router();
const { getSalaryStructures, getSalaryStructureById, createSalaryStructure, updateSalaryStructure, deleteSalaryStructure, updateStructureVersionComponents } = require('../controllers/salaryStructureController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect);
// We'll require ADMIN or HR or SUPERADMIN for payroll config
router.use(authorize('SUPERADMIN', 'ADMIN', 'HR'));

router.get('/', getSalaryStructures);
router.post('/', createSalaryStructure);
router.get('/:id', getSalaryStructureById);
router.put('/:id', updateSalaryStructure);
router.delete('/:id', deleteSalaryStructure);
router.put('/:id/versions/:versionId/components', updateStructureVersionComponents);

module.exports = router;
