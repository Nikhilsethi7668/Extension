
const mongoose = require('mongoose');
// Simple script to check count
const uri = 'mongodb://extension:Password1234@localhost:27018/facebookmark?authSource=admin';

const fs = require('fs');
const path = require('path');

mongoose.connect(uri)
    .then(async () => {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collNames = collections.map(c => c.name).join(', ');
        
        const collection = mongoose.connection.collection('imageprompts');
        const count = await collection.countDocuments({});
        
        const output = `Collections: ${collNames}\nImagePrompts Count: ${count}`;
        console.log(output);
        fs.writeFileSync(path.join(__dirname, 'db_check_result.txt'), output);
        
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        fs.writeFileSync(path.join(__dirname, 'db_check_result.txt'), `Error: ${err.message}`);
        process.exit(1);
    });
