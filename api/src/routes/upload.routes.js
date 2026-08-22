import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { protect } from '../middleware/auth.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use UPLOAD_STORAGE_PATH from env, falling back to './uploads' in root
        const storagePath = process.env.UPLOAD_STORAGE_PATH || './uploads';
        
        // Use req.user if available (since route is protected)
        const orgName = req.user?.organization?.slug || req.user?.organization?.name || 'default_org';
        const sanitizedOrgName = orgName.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
        const userId = req.user?._id || 'default_user';
        
        const uploadsDir = path.resolve(process.cwd(), storagePath, sanitizedOrgName, userId.toString(), 'uploads');
        
        // Ensure directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename: fieldname-timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images are allowed!'));
    }
});

// @desc    Upload single image
// @route   POST /api/upload
// @access  Protected
router.post('/', protect, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const orgName = req.user?.organization?.slug || req.user?.organization?.name || 'default_org';
    const sanitizedOrgName = orgName.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    const userId = req.user?._id || 'default_user';
    
    // Return the relative URL 
    const relativePath = `/uploads/${sanitizedOrgName}/${userId}/uploads/${req.file.filename}`;
    
    res.json({
        success: true,
        message: 'Image uploaded successfully',
        url: relativePath,
        filename: req.file.filename
    });
});

export default router;
