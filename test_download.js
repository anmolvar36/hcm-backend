const prisma = require('./src/config/prisma');
const jwt = require('jsonwebtoken');

const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, "hcm_super_secret_jwt_key_2026", { expiresIn: '7d' });
};

async function run() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('No user found in DB');
      return;
    }
    console.log('Found user:', user.email);
    const token = generateToken(user.id, user.role);
    console.log('Generated token:', token);

    const response = await fetch('http://localhost:5000/api/import/template/employees', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Response Status:', response.status);
    console.log('Response Headers:', response.headers);
    const text = await response.text();
    console.log('Response Data Length:', text.length);
    console.log('Response Snippet:', text.substring(0, 100));
  } catch (err) {
    console.error('Error details:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
