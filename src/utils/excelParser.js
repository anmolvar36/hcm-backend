const xlsx = require('xlsx');

/**
 * Parses an uploaded Excel or CSV file buffer into a JSON array of objects.
 * 
 * @param {Buffer} buffer - The file buffer from multer (req.file.buffer)
 * @returns {Array<Object>} - Array of objects where keys are header columns
 */
const parseExcelBuffer = (buffer) => {
  try {
    // Read the buffer
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    
    // Get the first sheet name
    const sheetName = workbook.SheetNames[0];
    
    // Get the worksheet
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert worksheet to JSON (using the first row as headers)
    const data = xlsx.utils.sheet_to_json(worksheet, { defval: null });
    
    return data;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

/**
 * Generates an empty Excel template for download based on expected headers.
 * 
 * @param {Array<String>} headers - Array of column names
 * @returns {Buffer} - Excel file buffer
 */
const generateTemplate = (headers) => {
  const worksheet = xlsx.utils.json_to_sheet([headers.reduce((acc, curr) => ({ ...acc, [curr]: '' }), {})]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Template');
  
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  parseExcelBuffer,
  generateTemplate
};
