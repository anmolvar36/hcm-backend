const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedBilling() {
  console.log("Seeding billing plans...");
  
  const plans = [
    { name: 'Enterprise', price: 999, cycle: 'Monthly', users: 100 },
    { name: 'Pro', price: 299, cycle: 'Monthly', users: 50 },
    { name: 'Team', price: 99, cycle: 'Monthly', users: 15 }
  ];

  const dbPlans = [];
  for (const plan of plans) {
    const p = await prisma.billingPlan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
    dbPlans.push(p);
  }

  const organizations = await prisma.organization.findMany();
  console.log(`Found ${organizations.length} organizations. Assigning random plans...`);

  let assignedCount = 0;
  for (const org of organizations) {
    // 10% Enterprise, 30% Pro, 60% Team roughly
    const r = Math.random();
    let selectedPlan = dbPlans[2]; // Team
    if (r < 0.1) selectedPlan = dbPlans[0]; // Enterprise
    else if (r < 0.4) selectedPlan = dbPlans[1]; // Pro

    await prisma.organization.update({
      where: { id: org.id },
      data: { 
        billingPlanId: selectedPlan.id,
        subscriptionStatus: 'Active'
      }
    });
    assignedCount++;

    // Create a few invoices for the org
    for (let i=0; i<3; i++) {
       const date = new Date();
       date.setMonth(date.getMonth() - i);
       await prisma.invoice.create({
         data: {
           organizationId: org.id,
           totalAmount: selectedPlan.price,
           method: 'Visa •••• 4242',
           status: 'Paid',
           date: date
         }
       });
    }
  }

  console.log(`Assigned plans to ${assignedCount} organizations.`);
}

seedBilling().catch(console.error).finally(() => prisma.$disconnect());
