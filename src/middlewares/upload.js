const multer = require('multer');

// Configure memory storage
// We keep the file in memory buffer so we can parse it synchronously without saving to disk
const storage = multer.memoryStorage();

// File filter to only allow Excel and CSV files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv' // .csv
  ];
  const validExtensions = /\.(xlsx|xls|csv)$/i;

  if (allowedMimeTypes.includes(file.mimetype) || validExtensions.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only .xlsx, .xls, and .csv are allowed.'));
  }
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB limit
  },
  fileFilter: fileFilter
});

module.exports = upload;
