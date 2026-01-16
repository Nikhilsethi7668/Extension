
const mongoose = require('mongoose');

const uri = 'mongodb://extension:Password1234@localhost:27018/facebookmark?authSource=admin';
console.log('Connecting to:', uri);

mongoose.connect(uri)
    .then(() => {
        console.log('Connected!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Connection failed:', err);
        process.exit(1);
    });
