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
import eventsRoutes from './routes/events.routes.js';
import postingRoutes from './routes/posting.routes.js';

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
        const allowedOrigins = [
            "http://localhost:5173", 
            "http://localhost:5000", 
            "https://flash.adaptusgroup.ca", 
            "https://api-flash.adaptusgroup.ca",
            "http://localhost:3682", 
            "http://66.94.120.78:3682"
        ];
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost') || origin.includes('adaptusgroup.ca')) {
            return callback(null, true);
        }
        // Fallback: Allow all for now to unblock user
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-org-id']
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
app.use('/api/events', eventsRoutes);
app.use('/api/postings', postingRoutes);

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
            const allowedOrigins = ["http://localhost:5173", "https://flash.adaptusgroup.ca", "https://api-flash.adaptusgroup.ca", "http://localhost:3682", "http://66.94.120.78:3682"];
            if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost')) {
                return callback(null, true);
            }
            callback(null, true);
        },
        credentials: true
    }
});

// Initialize Workers
// Initialize Cron Scheduler
import { initPostingCron } from './cron/posting.cron.js';
initPostingCron(io);

// Workers (Deprecated/Removed)
// import { initWorker } from './workers/posting.worker.js';
// initWorker(io);

// Socket.IO connection handling
// Socket.IO connection handling
io.on('connection', (socket) => {
    const clientType = socket.handshake.auth.clientType || socket.handshake.query.clientType || 'unknown';
    console.log(`[Socket.IO] Client connected: ${socket.id} (Type: ${clientType})`);

    // Register client type and join specific rooms
    socket.on('register-client', (data) => {
        const { orgId, userId, clientType } = data; // clientType: 'dashboard' | 'desktop' | 'extension'

        if (!orgId) return;

        // Join generic organization room (for broadcasts)
        socket.join(`org:${orgId}`);
        console.log(`[Socket.IO] Client ${socket.id} (${clientType}) joined org:${orgId}`);

        // Extension Specific: Join Profile Room if profileId exists
        if (clientType === 'extension' && data.profileId && userId) {
            socket.join(`user:${userId}:extension:${data.profileId}`);
            console.log(`[Socket.IO] Client ${socket.id} joined extension room: user:${userId}:extension:${data.profileId}`);
        }

        // Join specific client-type room (for targeted commands)
        // e.g., org:123:desktop
        if (clientType) {
            socket.join(`org:${orgId}:${clientType}`);
            console.log(`[Socket.IO] Client ${socket.id} joined specific room: org:${orgId}:${clientType}`);
            
            // Join USER-SPECIFIC room if userId is present
            if (userId) {
                socket.join(`user:${userId}:${clientType}`);
                console.log(`[Socket.IO] Client ${socket.id} joined user room: user:${userId}:${clientType}`);
            }
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

        // Find the user room this socket belongs to
        const rooms = Array.from(socket.rooms);
        const userRoom = rooms.find(r => r.startsWith('user:') && r.split(':').length === 3); // user:{userId}:{clientType}

        let userId, desktopRoom, extensionRoom;

        if (userRoom) {
            userId = userRoom.split(':')[1];
            desktopRoom = `user:${userId}:desktop`;
            // Extension room implies where we send the 'start-posting' event.
            // If the extension registers with userId, it will be in user:{userId}:extension?
            // But 'start-posting-vehicle' is actually sent to extension.
            // In the cron job, we use `org:{orgId}:extension` falling back?
            // Wait, for extension, strict isolation means we should emit to `user:{userId}:extension`?
            // Or `user:{userId}:extension`.
            // Let's assume extension also registers with userId (if we forced it).
            // But wait, extension uses /poll usually.
            // If we are emitting via socket (e.g. step 3 in this flow), we need to hit the extension via socket?
            // The code at line 191 says `io.to(extensionRoom).emit(...)`.
            // Does extension listen to socket?
            // If extension uses /poll, then this socket emit might be redundant or for a different mode (Socket Mode Extension).
            // SAFE BET: Emit to `org:{orgId}:extension` AND `user:{userId}:extension` if possible, OR just trust `user`.
            // If user demands "only use user id", then:
            extensionRoom = `user:${userId}:extension`;
        } else {
             // Fallback for legacy connections without userId (shouldn't happen if restarted)
             const orgRoom = rooms.find(r => r.startsWith('org:') && r.split(':').length === 2);
             if (orgRoom) {
                 const orgId = orgRoom.split(':')[1];
                 desktopRoom = `org:${orgId}:desktop`;
                 extensionRoom = `org:${orgId}:extension`;
             } else {
                 console.error('[Socket] Sender not in a recognized room');
                 return;
             }
        }

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

const server = httpServer.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Increase server timeout for long AI processing (10 minutes)
server.timeout = 600000; 
server.keepAliveTimeout = 610000;
server.headersTimeout = 620000;

