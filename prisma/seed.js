const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Start seeding database...');

  // 1. Clear existing data in correct dependency order
  await prisma.announcement.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.ticketMessage.deleteMany({});
  await prisma.supportTicket.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.performanceGoal.deleteMany({});
  await prisma.benefitClaim.deleteMany({});
  await prisma.payslip.deleteMany({});
  await prisma.attendanceLog.deleteMany({});
  await prisma.interview.deleteMany({});
  await prisma.jobApplication.deleteMany({});
  await prisma.jobPost.deleteMany({});
  await prisma.candidateProfile.deleteMany({});
  await prisma.employeeProfile.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  console.log('🧹 Cleaned existing database records.');

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'GlobalTech Solutions',
      logoUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=150',
      address: '100 Innovation Way, Silicon Valley, CA',
      taxId: 'TX-99887766',
    },
  });
  console.log(`🏢 Created Organization: ${org.name}`);

  // 3. Create Departments
  const deptEng = await prisma.department.create({
    data: { name: 'Engineering', organizationId: org.id },
  });
  const deptHR = await prisma.department.create({
    data: { name: 'Human Resources', organizationId: org.id },
  });
  const deptProd = await prisma.department.create({
    data: { name: 'Product & Design', organizationId: org.id },
  });
  console.log('📁 Created Departments');

  // 4. Hash standard password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);

  // 5. Create Users & Profiles
  // 5.1 SuperAdmin
  const superAdmin = await prisma.user.create({
    data: {
      email: 'superadmin@hcm.ai',
      passwordHash,
      role: 'SUPERADMIN',
    },
  });

  // 5.2 Admin
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@hcm.ai',
      passwordHash,
      role: 'ADMIN',
      organizationId: org.id,
      employeeProfile: {
        create: {
          employeeId: 'EMP-001',
          fullName: 'John Wick',
          phone: '+1 555-0101',
          address: '742 Continental Lane, NY',
          avatarUrl: 'https://i.pravatar.cc/150?u=john',
        },
      },
    },
  });

  // 5.3 HR
  const hrUser = await prisma.user.create({
    data: {
      email: 'hr@hcm.ai',
      passwordHash,
      role: 'HR',
      organizationId: org.id,
      employeeProfile: {
        create: {
          employeeId: 'EMP-002',
          fullName: 'Sarah Connor',
          phone: '+1 555-0102',
          address: '88 Cyberdyne Road, LA',
          avatarUrl: 'https://i.pravatar.cc/150?u=sarah',
          departmentId: deptHR.id,
        },
      },
    },
    include: { employeeProfile: true },
  });

  // 5.4 Manager
  const managerUser = await prisma.user.create({
    data: {
      email: 'manager@hcm.ai',
      passwordHash,
      role: 'MANAGER',
      organizationId: org.id,
      employeeProfile: {
        create: {
          employeeId: 'EMP-003',
          fullName: 'Alice Cooper',
          phone: '+1 555-0103',
          address: '456 Rock Ave, Phoenix',
          avatarUrl: 'https://i.pravatar.cc/150?u=alice',
          departmentId: deptProd.id,
        },
      },
    },
    include: { employeeProfile: true },
  });

  // 5.5 Employee
  const employeeUser = await prisma.user.create({
    data: {
      email: 'employee@hcm.ai',
      passwordHash,
      role: 'EMPLOYEE',
      organizationId: org.id,
      employeeProfile: {
        create: {
          employeeId: 'EMP-004',
          fullName: 'Bob Marley',
          phone: '+1 555-0104',
          address: '1 Love Lane, Kingston',
          avatarUrl: 'https://i.pravatar.cc/150?u=bob',
          departmentId: deptEng.id,
          managerId: managerUser.employeeProfile.id,
        },
      },
    },
    include: { employeeProfile: true },
  });

  // 5.6 Candidate
  const candidateUser = await prisma.user.create({
    data: {
      email: 'candidate@hcm.ai',
      passwordHash,
      role: 'CANDIDATE',
      candidateProfile: {
        create: {
          phone: '+1 555-0105',
          resumeUrl: 'https://meet.hcm.ai/resumes/alex_rivera.pdf',
        },
      },
    },
    include: { candidateProfile: true },
  });

  console.log('👤 Created Users and Profiles (password: password123)');

  // 6. Create Job Posts
  const job1 = await prisma.jobPost.create({
    data: {
      title: 'Senior Frontend Developer',
      description: 'Join our team to build state-of-the-art UI layouts using React and Vite.',
      requirements: 'React, TypeScript, Tailwind CSS, 5+ years experience',
      salaryRange: '$120k - $150k',
      location: 'Remote',
      jobType: 'Full-Time',
    },
  });

  const job2 = await prisma.jobPost.create({
    data: {
      title: 'Product Manager',
      description: 'Lead SaaS product lifecycle, sprint planning, and target specifications.',
      requirements: 'Agile, Product Roadmap, 3+ years experience',
      salaryRange: '$130k - $160k',
      location: 'Hybrid (New York)',
      jobType: 'Full-Time',
    },
  });
  console.log('💼 Created Job Posts');

  // 7. Create Job Application
  const application = await prisma.jobApplication.create({
    data: {
      jobId: job1.id,
      candidateId: candidateUser.candidateProfile.id,
      status: 'INTERVIEWING',
      coverLetter: 'I would love to join your amazing team and build highly interactive SaaS products.',
    },
  });
  console.log('📨 Created Job Application');

  // 8. Create Interview
  const interview = await prisma.interview.create({
    data: {
      applicationId: application.id,
      interviewerId: hrUser.employeeProfile.id,
      dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
      meetingLink: 'https://meet.google.com/abc-defg-hij',
    },
  });
  console.log('📅 Scheduled Interview');

  // 9. Create Attendance Log
  await prisma.attendanceLog.create({
    data: {
      userId: employeeUser.id,
      date: new Date(),
      clockIn: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
      clockOut: new Date(),
      status: 'Present',
      mode: 'Office',
    },
  });
  console.log('⏰ Logged Attendance');

  // 10. Create Leave Request
  await prisma.leaveRequest.create({
    data: {
      userId: employeeUser.id,
      leaveType: 'Annual Leave',
      startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
      totalDays: 5,
      reason: 'Family vacation and relaxation.',
      status: 'PENDING',
    },
  });
  console.log('✈️ Logged Leave Request');

  // 11. Create Payslip
  await prisma.payslip.create({
    data: {
      employeeId: employeeUser.employeeProfile.id,
      month: 'June',
      basic: 6000.0,
      hra: 1200.0,
      allowance: 500.0,
      bonus: 300.0,
      pf: 400.0,
      tax: 300.0,
      netPay: 7300.0,
      status: 'Paid',
      paymentDate: new Date(),
    },
  });
  console.log('💵 Created Payslip');

  // 12. Create Support Ticket
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: employeeUser.id,
      subject: 'VPN Connection Issues',
      category: 'IT Support',
      priority: 'High',
      status: 'OPEN',
      messages: {
        create: {
          senderId: employeeUser.id,
          text: 'Unable to connect to the corporate VPN from home network.',
        },
      },
    },
  });
  console.log('🎫 Created Support Ticket');

  // 13. Create Performance Goal
  await prisma.performanceGoal.create({
    data: {
      employeeId: employeeUser.employeeProfile.id,
      title: 'Complete React 19 Upgrade',
      progress: 60,
      priority: 'High',
      deadline: new Date('2026-09-30'),
    },
  });
  console.log('🎯 Created Performance Goal');

  // 14. Create Task
  await prisma.task.create({
    data: {
      employeeId: employeeUser.employeeProfile.id,
      title: 'Debug Login Session Redirects',
      description: 'Analyze axios 401 response handling and verify fallback modes.',
      status: 'Pending',
      priority: 'High',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    },
  });
  console.log('📋 Created Task');

  // 15. Create Announcements
  await prisma.announcement.createMany({
    data: [
      { title: 'Annual Team Building Retreat', date: 'Oct 28', category: 'Events', priority: 'high', content: 'We are excited to announce our annual team building retreat! Join us for a weekend of fun, collaboration, and networking at the Mountain Resort. Transportation and accommodation will be provided.' },
      { title: 'New Health Insurance Policy', date: 'Oct 22', category: 'Updates', priority: 'medium', content: 'Our health insurance provider has been updated to Blue Cross Premium. Please review the new policy documents in the Benefits section for details on coverage and benefits.' },
      { title: 'WFH Policy Update', date: 'Oct 15', category: 'HR', priority: 'low', content: 'Starting next month, our flexible work policy will allow for up to 3 days of remote work per week. Please coordinate with your manager for scheduling.' },
    ]
  });
  console.log('📢 Created Announcements');

  console.log('🌱 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
