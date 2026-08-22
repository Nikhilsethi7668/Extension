import axios from 'axios';
async function test() {
  try {
    const res = await axios.post('http://localhost:5573/api/auth/login', {
      email: 'admin@flashfender.com', // need to guess a login or bypass
      password: 'Password123'
    });
    console.log(res.data);
  } catch (e) {
    console.log(e.message, e.response?.data);
  }
}
test();
