
import axios from 'axios';

const trigger = async () => {
    try {
        console.log('Triggering sync...');
        const res = await axios.post('https://api.flashfender.com/api/vehicles/sync-prompts');
        console.log('Response:', res.data);
    } catch (err) {
        console.error('Error triggering sync:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
        }
    }
};

trigger();
