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
import chromeProfileRoutes from './routes/chromeProfile.routes.js';

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
        const allowedOrigins = ["http://localhost:5173", "http://localhost:5000", "http://localhost:5573", "http://localhost:3682", "http://66.94.120.78:3682"];
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
app.use('/api/chrome-profiles', chromeProfileRoutes);

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

// Create HTTP server and Socket.IO instance
import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (origin.startsWith('chrome-extension://')) return callback(null, true);
            const allowedOrigins = ["http://localhost:5173", "https://flash.adaptusgroup.ca", "http://localhost:5573", "http://localhost:3682", "http://66.94.120.78:3682"];
            if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost')) {
                return callback(null, true);
            }
            callback(null, true);
        },
        credentials: true
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    
    // Join organization room for multi-tenant isolation
    socket.on('join-organization', (organizationId) => {
        socket.join(`org:${organizationId}`);
        console.log(`[Socket.IO] Client ${socket.id} joined organization room: org:${organizationId}`);
    });

    socket.on('request-posting', async (data) => {
        console.log(`[Socket] Received request-posting from ${socket.id}:`, data);
        const { vehicleId, profileId } = data;
        
        if (!vehicleId || !profileId) return;

        let rooms = Array.from(socket.rooms).filter(r => r.startsWith('org:'));
        if (rooms.length === 0) { 
             console.error('[Socket] Sender not in an org room');
             return;
        }
        
        const orgRoom = rooms[0]; // Assuming one org per socket
        
        // Fetch vehicle details
        try {
            const Vehicle = (await import('./models/Vehicle.js')).default;
            const vehicle = await Vehicle.findById(vehicleId);
            
            if (vehicle) {
                 console.log(`[Socket] Orchestrating posting flow for vehicle ${vehicle.stockNumber || vehicle._id}`);
                 
                 // Step 1: Launch Browser (Desktop App)
                 console.log(`[Socket] Step 1: Requesting browser launch for profile ${profileId}`);
                 io.to(orgRoom).emit('launch-browser-profile', { 
                     profileId: profileId
                 });

                 // Step 2: Wait for browser to open and extension to connect
                 const DELAY_MS = 15000; // 15 seconds
                 console.log(`[Socket] Step 2: Waiting ${DELAY_MS}ms for extension to be ready...`);
                 
                 setTimeout(() => {
                     // Step 3: Trigger Posting (Extension)
                     console.log(`[Socket] Step 3: Triggering posting on extension`);
                     io.to(orgRoom).emit('start-posting-vehicle', { 
                         vehicleId: vehicle._id,
                         vehicleData: vehicle
                     });
                 }, DELAY_MS);
            }
        } catch (error) {
            console.error('[Socket] Error fetching vehicle for posting:', error);
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

// Attach IO to app safely
app.set('io', io);

// Export io for use in routes
export { io };

httpServer.listen(PORT, console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`));
