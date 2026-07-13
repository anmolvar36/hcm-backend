const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function dump() {
  const data = await prisma.compensationProfile.findMany();
  fs.writeFileSync('C:\\Users\\Shri\\.gemini\\antigravity-ide\\brain\\ce19b933-7f3a-4eaf-b9f4-85574f0cd37f\\scratch\\compensation_dump.json', JSON.stringify(data, null, 2));
  console.log('Dumped', data.length, 'profiles');
  
  const vdata = await prisma.compensationVersion.findMany();
  fs.writeFileSync('C:\\Users\\Shri\\.gemini\\antigravity-ide\\brain\\ce19b933-7f3a-4eaf-b9f4-85574f0cd37f\\scratch\\compensation_version_dump.json', JSON.stringify(vdata, null, 2));
  console.log('Dumped', vdata.length, 'versions');
  
  const compData = await prisma.salaryComponent.findMany();
  fs.writeFileSync('C:\\Users\\Shri\\.gemini\\antigravity-ide\\brain\\ce19b933-7f3a-4eaf-b9f4-85574f0cd37f\\scratch\\salary_component_dump.json', JSON.stringify(compData, null, 2));
  console.log('Dumped', compData.length, 'components');
}

dump().catch(console.error).finally(() => prisma.$disconnect());
