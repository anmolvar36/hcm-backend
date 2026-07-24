const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getIncrementRequests } = require('./src/controllers/managerController.js');

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'manager@gmail.com' } });
  
  const req = { user };
  const res = {
    status: (s) => ({
      json: (data) => console.log('STATUS:', s, 'DATA:', JSON.stringify(data, null, 2))
    })
  };
  const next = (err) => console.error('NEXT ERROR:', err);

  await getIncrementRequests(req, res, next);
}

main().catch(console.error).finally(() => prisma.$disconnect());
