const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { executeImport } = require('./src/services/importService');

async function testImport() {
  const mockRows = [
    { fullName: 'Rahul Sharma', employeeId: 'EMP-005', email: 'rahul.sharma@org.com', phone: '+91 9876543210', role: 'Employee', department: 'Engineering', manager: 'Amit Verma', employmentType: 'Full-Time', joiningDate: '15-01-2024', status: 'Active', monthlyCTC: 65000 },
    { fullName: 'Priya Patel', employeeId: 'EMP-006', email: 'priya.patel@org.com', phone: '+91 9876543211', role: 'Employee', department: 'Human Resources', manager: 'Neha Singh', employmentType: 'Full-Time', joiningDate: '10-03-2023', status: 'Active', monthlyCTC: 58000 },
    { fullName: 'Arjun Mehta', employeeId: 'EMP-007', email: 'arjun.mehta@org.com', phone: '+91 9876543212', role: 'Employee', department: 'Finance', manager: 'Rakesh Jain', employmentType: 'Full-Time', joiningDate: '05-07-2022', status: 'Active', monthlyCTC: 72000 },
    { fullName: 'Sneha Gupta', employeeId: 'EMP-008', email: 'sneha.gupta@org.com', phone: '+91 9876543213', role: 'Employee', department: 'Marketing', manager: 'Pooja Kapoor', employmentType: 'Full-Time', joiningDate: '20-08-2024', status: 'Probation', monthlyCTC: 48000 },
    { fullName: 'Vikram Singh', employeeId: 'EMP-009', email: 'vikram.singh@org.com', phone: '+91 9876543214', role: 'Employee', department: 'Sales', manager: 'Amit Chauhan', employmentType: 'Full-Time', joiningDate: '11-11-2021', status: 'Active', monthlyCTC: 85000 },
    { fullName: 'Ananya Deshmukh', employeeId: 'EMP-010', email: 'ananya.deshmukh@org.com', phone: '+91 9876543215', role: 'Employee', department: 'Engineering', manager: 'Amit Verma', employmentType: 'Full-Time', joiningDate: '02-05-2025', status: 'Active', monthlyCTC: 62000 },
    { fullName: 'Rohit Nair', employeeId: 'EMP-011', email: 'rohit.nair@org.com', phone: '+91 9876543216', role: 'Employee', department: 'Support', manager: 'Kiran Joshi', employmentType: 'Contract', joiningDate: '18-09-2023', status: 'Active', monthlyCTC: 42000 },
    { fullName: 'Kavya Iyer', employeeId: 'EMP-012', email: 'kavya.iyer@org.com', phone: '+91 9876543217', role: 'Employee', department: 'Operations', manager: 'Suresh Mishra', employmentType: 'Full-Time', joiningDate: '12-12-2022', status: 'On Leave', monthlyCTC: 61000 },
    { fullName: 'Mohit Agarwal', employeeId: 'EMP-013', email: 'mohit.agarwal@org.com', phone: '+91 9876543218', role: 'Employee', department: 'Information Technology', manager: 'Amit Verma', employmentType: 'Full-Time', joiningDate: '25-04-2020', status: 'Active', monthlyCTC: 98000 },
    { fullName: 'Riya Thomas', employeeId: 'EMP-014', email: 'riya.thomas@org.com', phone: '+91 9876543219', role: 'Employee', department: 'Quality Assurance', manager: 'Deepak Soni', employmentType: 'Full-Time', joiningDate: '30-06-2024', status: 'Active', monthlyCTC: 57000 },
  ];

  const org = await prisma.organization.findFirst();
  const context = { organizationId: org?.id, userId: null };

  const result = await executeImport(mockRows, 'employees', context);
  console.log('Result:', result);
  
  await prisma.$disconnect();
}

testImport().catch(e => { console.error(e); process.exit(1); });
