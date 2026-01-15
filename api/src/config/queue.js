import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = {
    host: process.env.REDIS_HOST || 'redis', // Hostname in docker-compose or env
    port: 6379,
    maxRetriesPerRequest: null
};

// Create a Redis connection instance specifically for the queue
const connection = new IORedis(redisConfig);

connection.on('connect', () => {
    console.log(`[Redis] Connected to ${redisConfig.host}:${redisConfig.port}`);
});

connection.on('error', (err) => {
    console.error('[Redis] Connection Error:', err);
});

connection.on('ready', () => {
    console.log('[Redis] Ready and accepting commands');
});

if (connection.status === 'ready') {
    console.log('[Redis] Status is already READY');
}

export const postingQueue = new Queue('posting-queue', { 
    connection,
    defaultJobOptions: {
        attempts: 1, // Don't retry automatically if failed logic decides otherwise, but might want 2 to be safe
        removeOnComplete: 100, // Keep last 100
        removeOnFail: 200 // Keep last 200 for debugging
    }
});

export const redisConnection = connection;
