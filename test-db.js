const prisma = require('./src/config/prisma');

async function test() {
  try {
    console.log("Checking DB connection...");
    const org = await prisma.organization.findFirst();
    console.log("Organization found:", org);

    console.log("Attempting to create a department...");
    const dept = await prisma.department.create({
      data: {
        name: "Test Department",
        organizationId: org ? org.id : "some-uuid",
        code: "TEST",
        head: "Test Head",
        parent: "Corporate",
        description: "Test Description",
        color: "#4f46e5",
        status: "Active",
      },
      include: { _count: { select: { employees: true } } },
    });
    console.log("Department created successfully:", dept);
  } catch (err) {
    console.error("Error during test:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
