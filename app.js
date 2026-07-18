// ============================================================
// app.js - Express Server Entry Point
// ============================================================

require('dotenv').config(); // .env file load karo sabse pehle

const express = require('express');
const cors = require('cors');

const errorHandler = require('./src/middlewares/errorHandler');

// ── Route Modules ──
const authRoutes        = require('./src/routes/authRoutes');
const employeeRoutes    = require('./src/routes/employeeRoutes');
const managerRoutes     = require('./src/routes/managerRoutes');
const hrRoutes          = require('./src/routes/hrRoutes');
const adminRoutes       = require('./src/routes/adminRoutes');
const superAdminRoutes  = require('./src/routes/superAdminRoutes');
const salaryStructureRoutes = require('./src/routes/salaryStructureRoutes');
const candidateRoutes   = require('./src/routes/candidateRoutes');
const settingsRoutes    = require('./src/routes/settingsRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const publicRoutes      = require('./src/routes/publicRoutes');
const pricingRoutes     = require('./src/routes/pricingRoutes');
const importRoutes      = require('./src/routes/importRoutes');
const reimbursementRoutes = require('./src/routes/reimbursementRoutes');
const calendarRoutes    = require('./src/routes/calendarRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ---- GLOBAL MIDDLEWARES ----

// CORS: Frontend (localhost:5173, 5174, 5175) ko backend se baat karne do
const envClientUrls = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173'];

const allowedOrigins = [
  ...envClientUrls,
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'https://human-hcm.netlify.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));

// JSON body parser: request body ko parse karne ke liye (increased limit for base64 resumes)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded static files
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ---- HEALTH CHECK ----
app.get('/', (req, res) => {
  res.json({ success: true, message: 'HCM Backend is running!' });
});

// ── API Routes ──
app.use('/api/auth',        authRoutes);        // POST /login, /register | GET /me
app.use('/api/employee',    employeeRoutes);    // Profile, Attendance, Leave, Payslips
app.use('/api/manager',     managerRoutes);     // Team, Approvals, Tasks, KPI
app.use('/api/hr',          hrRoutes);          // Jobs, Candidates, Interviews, Onboarding
app.use('/api/admin',       adminRoutes);       // Org, Departments, Users, Payroll, Audit
app.use('/api/admin/salary-structures', salaryStructureRoutes); // Salary Structures
app.use('/api/superadmin',  superAdminRoutes);  // Platform-level: All orgs, all users, system health
app.use('/api/candidate',   candidateRoutes);   // Browse Jobs, Apply, Track Applications
app.use('/api/settings',    settingsRoutes);    // Global App Settings
app.use('/api/notifications', notificationRoutes);
app.use('/api/public',      publicRoutes);      // Demo booking, contact form, career applications
app.use('/api/pricing',     pricingRoutes);
app.use('/api/import',      importRoutes);      // Generic Excel Import Engine
app.use('/api/reimbursements', reimbursementRoutes);
app.use('/api/admin/calendars', calendarRoutes);

// ---- GLOBAL ERROR HANDLER (hamesha last mein) ----
app.use(errorHandler);

// ---- SERVER START ----
app.listen(PORT, () => {
  console.log(`✅ HCM Backend Server running on http://localhost:${PORT}`);
});
