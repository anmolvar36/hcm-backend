const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const onb = await prisma.onboarding.findFirst({
    include: { application: { include: { candidate: true } } }
  });
  
  console.log('Onboarding:', onb ? onb.id : 'None');
  if (!onb) return;

  try {
    const res = await fetch(`http://localhost:5000/api/hr/onboarding/${onb.id}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: 'EMP-9999',
        departmentId: null,
        managerId: null,
        joiningDate: new Date().toISOString()
      })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch(e) {
    console.error(e);
  }
}
run();
