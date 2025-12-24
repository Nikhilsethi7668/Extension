
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const saveImageLocally = async (imageBuffer, fileName) => {
    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '../../public/uploads'); 
    // Assuming /api/src/services/.. -> /api/public/uploads
    // Let's verify path relative to root: api/public/uploads
    
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, imageBuffer);
    
    return `/uploads/${fileName}`; // Return relative path for URL
};
