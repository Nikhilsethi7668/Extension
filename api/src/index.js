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

// Initialize Workers
import { initWorker } from './workers/posting.worker.js';
initWorker(io);

// Socket.IO connection handling
// Socket.IO connection handling
io.on('connection', (socket) => {
    const clientType = socket.handshake.auth.clientType || socket.handshake.query.clientType || 'unknown';
    console.log(`[Socket.IO] Client connected: ${socket.id} (Type: ${clientType})`);
    
    // Register client type and join specific rooms
    socket.on('register-client', (data) => {
        const { orgId, clientType } = data; // clientType: 'dashboard' | 'desktop' | 'extension'
        
        if (!orgId) return;

        // Join generic organization room (for broadcasts)
        socket.join(`org:${orgId}`);
        console.log(`[Socket.IO] Client ${socket.id} (${clientType}) joined org:${orgId}`);

        // Join specific client-type room (for targeted commands)
        // e.g., org:123:desktop
        if (clientType) {
            socket.join(`org:${orgId}:${clientType}`);
            console.log(`[Socket.IO] Client ${socket.id} joined specific room: org:${orgId}:${clientType}`);
        }
    });

    // Backward compatibility for generic join (treats as dashboard/generic)
    socket.on('join-organization', (organizationId) => {
        socket.join(`org:${organizationId}`);
        console.log(`[Socket.IO] Client ${socket.id} joined organization room (legacy): org:${organizationId}`);
    });

    socket.on('request-posting', async (data) => {
        console.log(`[Socket] Received request-posting from ${socket.id}:`, data);
        const { vehicleId, profileId } = data;
        
        if (!vehicleId || !profileId) return;

        // Find the organization this socket belongs to
        // We look for a room starting with 'org:' but NOT containing another ':' (which would be the specific room)
        // Or we just parse one.
        const rooms = Array.from(socket.rooms);
        const orgRoom = rooms.find(r => r.startsWith('org:') && r.split(':').length === 2);
        
        if (!orgRoom) { 
             console.error('[Socket] Sender not in an org room');
             return;
        }

        const orgId = orgRoom.split(':')[1];
        const desktopRoom = `org:${orgId}:desktop`;
        const extensionRoom = `org:${orgId}:extension`;
        
        // Fetch vehicle details
        try {
            const Vehicle = (await import('./models/Vehicle.js')).default;
            const vehicle = await Vehicle.findById(vehicleId);
            
            if (vehicle) {
                 console.log(`[Socket] Orchestrating posting flow for vehicle ${vehicle.stockNumber || vehicle._id}`);
                 
                 // Step 1: Launch Browser (Desktop App)
                 console.log(`[Socket] Step 1: Requesting browser launch for profile ${profileId} in room ${desktopRoom}`);
                 io.to(desktopRoom).emit('launch-browser-profile', { 
                     profileId: profileId
                 });

                 // Step 2: Wait for browser to open and extension to connect
                 const DELAY_MS = 15000; // 15 seconds wait for browser launch
                 console.log(`[Socket] Step 2: Waiting ${DELAY_MS}ms for extension to be ready...`);
                 
                 setTimeout(() => {
                     // Step 3: Trigger Posting (Extension)
                     // We send to the extension-specific room
                     console.log(`[Socket] Step 3: Triggering posting on extension in room ${extensionRoom}`);
                     io.to(extensionRoom).emit('start-posting-vehicle', { 
                         vehicleId: vehicle._id,
                         vehicleData: vehicle
                     });
                 }, DELAY_MS);
            }
        } catch (error) {
            console.error('[Socket] Error fetching vehicle for posting:', error);
        }

    });

    // Verification Signal Listener
    socket.on('verify-vehicle-posting', (data) => {
        console.log(`[Socket] Received verification signal from ${socket.id}`, data);
    });

    // Posting Result Listener (Ephemeral Queue Bridge)
    socket.on('posting-result', (data) => {
        console.log(`[Socket] Received posting-result from ${socket.id}`, data); // { postingId, success, error }
        
        // Dynamically import the emitter to avoid top-level circular dependency issues if any,
        // (though ES modules usually handle it, let's keep it safe or just rely on global)
        // Actually, let's assume we import jobEvents at the top.
        // For now, let's use a dynamic import or assume it's available.
        // Better: We will add the import at the top of the file in a separate edit.
        // Here we just use it.
        import('./workers/posting.worker.js').then(({ jobEvents }) => {
             jobEvents.emit('job-completed', { 
                 jobId: data.jobId || data.postingId, // Extension should send jobId back
                 success: data.success,
                 error: data.error
             });
        });
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
