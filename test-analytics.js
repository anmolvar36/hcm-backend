async function test() {
  try {
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'superadmin@hcm.ai', password: 'password123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.token || loginData.token;
    
    const res = await fetch('http://localhost:5000/api/superadmin/analytics?timeRange=30d', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log(res.status, data);
  } catch (e) {
    console.error(e);
  }
}
test();
