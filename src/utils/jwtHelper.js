// ============================================================
// JWT Helper Utilities
// ============================================================
// JWT = JSON Web Token - login ke baad user ko ek token milta hai
// Har request mein ye token bheja jaata hai identity prove karne ke liye

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Token BANAO (login ke baad call hota hai)
const signToken = (payload) => {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
};

// Token VERIFY KARO (har protected request mein check hota hai)
const verifyToken = (token) => {
  return jwt.verify(token, SECRET);
};

module.exports = { signToken, verifyToken };
