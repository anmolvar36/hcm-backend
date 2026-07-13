const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { handleTransition, LifecycleEvents } = require('./src/services/workflowService');

async function test() {
  try {
    const onboarding = await prisma.onboarding.findFirst();
    if (!onboarding) return console.log('No onboarding record found');
    
    console.log('Testing promote on onboarding ID:', onboarding.id);
    
    await handleTransition(LifecycleEvents.PROMOTED, {
      onboardingId: onboarding.id,
      employeeId: 'EMP' + Math.floor(Math.random()*10000),
      departmentId: null,
      managerId: null,
      joiningDate: new Date().toISOString()
    });
    console.log('Success!');
  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
