/**
* Image Processor Service
* Prepares vehicle images for Facebook Marketplace with humanized metadata and pixel uniqueness
*/

import sharp from 'sharp';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveImageLocally } from './storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Camera model pool for realistic EXIF data
export const CAMERA_MODELS = [
    { make: 'Apple', model: 'iPhone 13', software: 'iOS 17.1.2' },
    { make: 'Apple', model: 'iPhone 14', software: 'iOS 17.2.1' },
    { make: 'Apple', model: 'iPhone 14 Pro', software: 'iOS 17.3' },
    { make: 'Apple', model: 'iPhone 15', software: 'iOS 18.0.1' },
    { make: 'Apple', model: 'iPhone 15 Pro', software: 'iOS 18.1' },
    { make: 'Samsung', model: 'SM-S911B', software: 'One UI 6.0' }, // Galaxy S23
    { make: 'Samsung', model: 'SM-S918B', software: 'One UI 6.0' }, // Galaxy S23 Ultra
    { make: 'Samsung', model: 'SM-G998B', software: 'One UI 5.1' }, // Galaxy S21 Ultra
    { make: 'Google', model: 'Pixel 8 Pro', software: 'Android 14' },
    { make: 'Google', model: 'Pixel 7', software: 'Android 13' },
];

// Default GPS coordinates (Dubai, UAE - can be configured per organization)
export const DEFAULT_GPS = {
    latitude: 25.2048,
    longitude: 55.2708
};

/**
 * Get a random camera model from the pool
 */
const getRandomCamera = () => {
    return CAMERA_MODELS[Math.floor(Math.random() * CAMERA_MODELS.length)];
};

/**
 * Generate a human-like filename (IMG_XXXX.jpg or timestamp format)
 */
export const generateHumanFilename = (extension = 'jpg') => {
    const patterns = [
        // iPhone style: IMG_XXXX.jpg
        () => `IMG_${Math.floor(1000 + Math.random() * 8999)}.${extension}`,
        // Android style: timestamp
        () => {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            return `${year}${month}${day}_${hour}${min}${Math.floor(Math.random() * 60).toString().padStart(2, '0')}.${extension}`;
        },
        // Samsung style: YYYYMMDD_HHMMSS_XXX.jpg
        () => {
            const now = new Date();
            const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
            return `${dateStr}_${Math.floor(100 + Math.random() * 899)}.${extension}`;
        }
    ];

    return patterns[Math.floor(Math.random() * patterns.length)]();
};

/**
 * Generate a unique DateTime string for EXIF (spaced 30s - 3min apart)
 * @param {number} index - Index in batch for spacing
 * @param {Date} baseTime - Base time to add offset from
 */
export const generateUniqueDateTime = (index = 0, baseTime = new Date()) => {
    // Random offset between 30 seconds and 3 minutes per image
    const minOffset = 30; // seconds
    const maxOffset = 180; // seconds
    const offsetSeconds = index * (minOffset + Math.random() * (maxOffset - minOffset));

    const datetime = new Date(baseTime.getTime() - (offsetSeconds * 1000));

    // Format: YYYY:MM:DD HH:MM:SS
    const year = datetime.getFullYear();
    const month = String(datetime.getMonth() + 1).padStart(2, '0');
    const day = String(datetime.getDate()).padStart(2, '0');
    const hour = String(datetime.getHours()).padStart(2, '0');
    const min = String(datetime.getMinutes()).padStart(2, '0');
    const sec = String(datetime.getSeconds()).padStart(2, '0');

    return `${year}:${month}:${day} ${hour}:${min}:${sec}`;
};

/**
 * Apply subtle pixel variations to make the image unique
 * Changes brightness/contrast by 0.1-0.5% to alter hash without visible change
 */
export const makePixelUnique = async (imageBuffer) => {
    // Random brightness adjustment: 0.99 to 1.01 (±1%)
    const brightness = 0.99 + Math.random() * 0.02;

    // Random contrast adjustment: very subtle
    const contrast = 0.99 + Math.random() * 0.02;

    // Random saturation adjustment
    const saturation = 0.99 + Math.random() * 0.02;

    // Apply subtle gamma shift for additional uniqueness
    // Note: Sharp requires gamma to be between 1.0 and 3.0
    const gamma = 1.0 + Math.random() * 0.05; // Range: 1.0 to 1.05

    return sharp(imageBuffer)
        .modulate({
            brightness: brightness,
            saturation: saturation
        })
        .gamma(gamma)
        .toBuffer();
};

/**
 * Resize image to optimal marketplace dimensions (2048px max)
 * Maintains aspect ratio and quality
 */
export const resizeForMarketplace = async (imageBuffer, maxSize = 2048) => {
    const metadata = await sharp(imageBuffer).metadata();

    // Only resize if larger than max size
    if (metadata.width <= maxSize && metadata.height <= maxSize) {
        return imageBuffer;
    }

    return sharp(imageBuffer)
        .resize(maxSize, maxSize, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .jpeg({ quality: 92 }) // High quality JPEG
        .toBuffer();
};

/**
 * Apply geometric perturbations (Micro-rotation + Cropping)
 * This defeats pHash and other geometric hashing algorithms by shifting the pixel grid
 */
export const applyGeometricPerturbation = async (imageBuffer) => {
    // 1. Load image to get dimensions
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // 2. Micro-Rotation: Random angle between -1.5 and +1.5 degrees
    // This is invisible to eye but rotates the pixel grid
    const angle = (Math.random() * 3) - 1.5;

    // 3. Smart Cropping (2-4%)
    // We crop to remove any black edges from rotation AND to shift the frame
    const cropPercent = 0.02 + (Math.random() * 0.02);
    const cropX = Math.floor(width * cropPercent);
    const cropY = Math.floor(height * cropPercent);
    const cropWidth = width - (cropX * 2);
    const cropHeight = height - (cropY * 2);

    return image
        .rotate(angle, {
            background: '#ffffff' // White background for any tiny gaps (though crop removes them)
        })
        .extract({
            left: cropX,
            top: cropY,
            width: cropWidth,
            height: cropHeight
        })
        .toBuffer();
};

/**
 * Inject EXIF metadata into image
 * Note: Sharp has limited EXIF support, so we embed what we can via metadata options
 */
export const injectMetadata = async (imageBuffer, options = {}) => {
    const camera = options.camera || getRandomCamera();
    const gps = options.gps || DEFAULT_GPS;
    const datetime = options.datetime || generateUniqueDateTime();

    // Sharp can embed EXIF data through the withMetadata option
    // We create a metadata object that includes our humanized data
    return sharp(imageBuffer)
        .withMetadata({
            exif: {
                IFD0: {
                    Make: camera.make,
                    Model: camera.model,
                    Software: camera.software,
                    DateTime: datetime,
                    Orientation: '1' // Must be string, not number
                },
                IFD1: {},
                EXIF: {
                    DateTimeOriginal: datetime,
                    DateTimeDigitized: datetime,
                    ExifVersion: '0232',
                    ColorSpace: '1',  // sRGB, must be string
                    ExifImageWidth: '2048',
                    ExifImageHeight: '1536'
                },
                GPS: {
                    GPSLatitudeRef: gps.latitude >= 0 ? 'N' : 'S',
                    GPSLatitude: String(Math.abs(gps.latitude)),
                    GPSLongitudeRef: gps.longitude >= 0 ? 'E' : 'W',
                    GPSLongitude: String(Math.abs(gps.longitude))
                }
            }
        })
        .jpeg({ quality: 92 })
        .toBuffer();
};

/**
 * Full image preparation pipeline
 * Fetches image, resizes, makes unique, injects metadata, and saves
 */
/**
 * Full image preparation pipeline
 * Fetches image, resizes, makes unique, injects metadata, and saves
 */
export const prepareImage = async (imageUrl, options = {}) => {
    try {
        console.log(`[Image Processor] Starting preparation for: ${imageUrl}`);

        // Step 1: Fetch the original image
        const axiosConfig = { responseType: 'arraybuffer' };
        if (imageUrl.includes('generate.flashfender.com') && process.env.FLASH_FENDER_IMG_KEY) {
            axiosConfig.headers = { 'x-api-key': process.env.FLASH_FENDER_IMG_KEY };
        }
        const response = await axios.get(imageUrl, axiosConfig);
        let imageBuffer = Buffer.from(response.data);

        // Step 2: Resize for marketplace (2048px max)
        imageBuffer = await resizeForMarketplace(imageBuffer, options.maxSize || 2048);

        // Step 3: Make pixels unique (subtle variations)
        imageBuffer = await makePixelUnique(imageBuffer);

        // Step 4: Apply Geometric Perturbation (Rotation + Crop) - NUCLEAR STEALTH
        try {
            imageBuffer = await applyGeometricPerturbation(imageBuffer);
        } catch (geoError) {
            console.warn(`[Image Processor] Geometric perturbation failed (skipping): ${geoError.message}`);
            // Continue if rotation fails (e.g. tiny images)
        }

        // Step 5: Inject humanized metadata
        const camera = options.camera || getRandomCamera();
        const gps = options.gps || DEFAULT_GPS;
        const datetime = options.datetime || generateUniqueDateTime(options.index || 0);

        imageBuffer = await injectMetadata(imageBuffer, {
            camera,
            gps,
            datetime
        });

        // Step 5: Generate human-like filename and save
        const filename = options.filename || `prepared_${generateHumanFilename('jpg')}`;
        const folderName = options.folder || 'prepared';

        // Ensure prepared directory exists
        const preparedDir = path.join(__dirname, `../../public/uploads/${folderName}`);
        if (!fs.existsSync(preparedDir)) {
            fs.mkdirSync(preparedDir, { recursive: true });
        }

        const filePath = path.join(preparedDir, filename);
        fs.writeFileSync(filePath, imageBuffer);

        const savedUrl = `/uploads/${folderName}/${filename}`;
        console.log(`[Image Processor] ✅ Saved prepared image: ${savedUrl}`);

        return {
            success: true,
            originalUrl: imageUrl,
            preparedUrl: savedUrl, // Use relative URL for Docker compatibility
            relativePath: savedUrl,
            metadata: {
                camera: `${camera.make} ${camera.model}`,
                software: camera.software,
                datetime: datetime,
                gps: gps
            }
        };

    } catch (error) {
        console.error(`[Image Processor] Error preparing image: ${error.message}`);
        return {
            success: false,
            originalUrl: imageUrl,
            error: error.message
        };
    }
};

/**
 * Batch prepare multiple images with unique metadata per image
 * Ensures each image has different timestamps, slight variations, etc.
 */
export const prepareImageBatch = async (imageUrls, options = {}) => {
    // defaults
    const batchCamera = options.camera || getRandomCamera();
    const baseTime = new Date();
    const gps = options.gps || DEFAULT_GPS;
    const folder = options.folder || 'prepared';

    console.log(`[Image Processor] Starting batch preparation of ${imageUrls.length} images (Parallel)`);
    console.log(`[Image Processor] Using camera: ${batchCamera.make} ${batchCamera.model}`);

    // Parallel Processing with Promise.all
    const promises = imageUrls.map(async (imageUrl, i) => {
        try {
            return await prepareImage(imageUrl, {
                camera: batchCamera,
                gps: gps,
                index: i,
                datetime: generateUniqueDateTime(i, baseTime),
                maxSize: options.maxSize || 2048,
                folder: folder
            });
        } catch (error) {
            return {
                success: false,
                originalUrl: imageUrl,
                error: error.message
            };
        }
    });

    const allResults = await Promise.all(promises);

    const successResults = allResults.filter(r => r.success);
    const errorResults = allResults.filter(r => !r.success);

    console.log(`[Image Processor] Batch complete: ${successResults.length} success, ${errorResults.length} failed`);

    return {
        success: errorResults.length === 0,
        totalProcessed: imageUrls.length,
        successCount: successResults.length,
        errorCount: errorResults.length,
        results: successResults,
        errors: errorResults,
        batchMetadata: {
            camera: `${batchCamera.make} ${batchCamera.model}`,
            gps: gps,
            processedAt: new Date().toISOString()
        }
    };
};

/**
 * Get available camera models for configuration
 */
export const getAvailableCameras = () => {
    return CAMERA_MODELS.map(c => ({
        label: `${c.make} ${c.model}`,
        value: c.model,
        software: c.software
    }));
};

export default {
    prepareImage,
    prepareImageBatch,
    prepareImageBatch,
    makePixelUnique,
    applyGeometricPerturbation,
    resizeForMarketplace,
    injectMetadata,
    generateHumanFilename,
    generateUniqueDateTime,
    getAvailableCameras,
    DEFAULT_GPS,
    CAMERA_MODELS
};
