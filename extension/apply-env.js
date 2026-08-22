const fs = require('fs');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5573/api';

// Create env.js
const envContent = `globalThis.ENV = {
  API_BASE_URL: '${API_BASE_URL}'
};
`;
fs.writeFileSync('env.js', envContent);
console.log('Created env.js');

// Update manifest.json permissions
const manifestPath = 'manifest.json';
if (fs.existsSync(manifestPath)) {
    const url = new URL(API_BASE_URL);
    const hostPermission = `${url.protocol}//${url.host}/*`;
    
    let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Add the new host permission if not present
    if (!manifest.host_permissions.includes(hostPermission)) {
        manifest.host_permissions.push(hostPermission);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
        console.log(`Added ${hostPermission} to manifest.json`);
    }
}

console.log('Successfully applied .env to extension.');
