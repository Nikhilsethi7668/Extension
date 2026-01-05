import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import connectDB from './config/db.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import vehicleRoutes from './routes/vehicle.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import userRoutes from './routes/user.routes.js';
import testDataRoutes from './routes/testData.routes.js';
import logsRoutes from './routes/logs.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';

dotenv.config();

// Connect to Database
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        // Allow chrome extensions
        if (origin.startsWith('chrome-extension://')) return callback(null, true);
        // Allow local dev and production
        const allowedOrigins = ["http://localhost:5173", "http://localhost:5000", "http://localhost:5573", "http://localhost:3682", "http://94.250.203.249:3682"];
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost')) {
            return callback(null, true);
        }
        callback(null, true); // Fallback: Allow all for now to unblock user
    },
    credentials: true
}));
app.use(morgan('dev'));

// Route Registration
app.use((req, res, next) => {
    console.log(`[SUPER DEBUG] ${req.method} ${req.url}`);
    console.log('[DEBUG] Headers:', JSON.stringify(req.headers));
    next();
});
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/test-data', testDataRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Static File Serving (for generated images)
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

app.get('/', (req, res) => {
    res.send('FacebookMark API is running...');
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const PORT = 5573;

app.listen(PORT, console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`));
