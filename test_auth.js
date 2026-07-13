fetch('http://localhost:5000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Test', email: 'test12345@company.com', password: 'password123', role: 'EMPLOYEE' })
}).then(r => r.json()).then(console.log).catch(console.error);
