
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'prompts.json');
const raw = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(raw);
const sliced = data.slice(0, 50);

fs.writeFileSync(filePath, JSON.stringify(sliced, null, 2));
console.log('Truncated prompts.json to 50 items.');
