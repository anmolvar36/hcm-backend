const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { downloadTemplate, previewImport, processImport } = require('../controllers/importController');
const { protect } = require('../middlewares/authMiddleware'); // assuming protect exists

// Apply auth middleware to all import routes
router.use(protect);

// GET: Download template
router.get('/template/:entity', downloadTemplate);

// POST: Upload and preview
router.post('/preview/:entity', upload.single('file'), previewImport);

// POST: Execute the actual import
router.post('/execute/:entity', upload.single('file'), processImport);

module.exports = router;
