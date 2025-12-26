import axios from 'axios';

const API_KEY = 'a3181b4d-fb45-4906-a990-2fa35e441129';
const URL = 'http://localhost:5001/api/auth/dashboard-api-login';

async function testLogin() {
    try {
        console.log(`Testing login with key: ${API_KEY}`);
        const response = await axios.post(URL, { apiKey: API_KEY });
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Login Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

testLogin();
