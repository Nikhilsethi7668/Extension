
const mongoose = require('mongoose');
const fs = require('fs');

// Hardcoded URI for host execution
const uri = 'mongodb://extension:Password1234@127.0.0.1:27018/facebookmark?authSource=admin';
const outputPath = 'C:\\Users\\itsad\\Desktop\\PlexDubai\\Extension\\api\\verify_final.txt';

const ImagePromptsSchema = new mongoose.Schema({
    title: String,
    prompt: String
});
const ImagePrompts = mongoose.model('ImagePrompts', ImagePromptsSchema);

console.log('Connecting...');
mongoose.connect(uri)
    .then(async () => {
        console.log('Connected.');
        const count = await ImagePrompts.countDocuments({});
        console.log('Count:', count);
        fs.writeFileSync(outputPath, `Count: ${count}`);
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        fs.writeFileSync(outputPath, `Error: ${err.message}`);
        process.exit(1);
    });
