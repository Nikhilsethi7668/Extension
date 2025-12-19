import express from 'express';
import Vehicle from '../models/Vehicle.js';
import { protect, admin } from '../middleware/auth.js';
import { generateVehicleContent } from '../services/ai.service.js';
import { scrapeVehicle } from '../services/scraper.service.js';

const router = express.Router();

// @desc    Get all vehicles for an organization
// @route   GET /api/vehicles
// @access  Protected
router.get('/', protect, async (req, res) => {
    const { status, minPrice, maxPrice, search, repostEligible, days } = req.query;
    const query = { organization: req.user.organization._id };

    // Agents only see vehicles assigned to them
    if (req.user.role === 'agent') {
        query.assignedUser = req.user._id;
    }

    // Filter by Status
    if (status) query.status = status;

    // Filter by Price Range
    if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = Number(minPrice);
        if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Search (Keyword)
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        query.$or = [
            { make: searchRegex },
            { model: searchRegex },
            { vin: searchRegex },
            { 'aiContent.title': searchRegex }
        ];
        if (!isNaN(search)) query.$or.push({ year: Number(search) });
    }

    let vehicles = await Vehicle.find(query).sort('-createdAt');

    // Filter for Repost Eligibility
    if (repostEligible === 'true') {
        const eligibilityDays = Number(days) || 7;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - eligibilityDays);

        vehicles = vehicles.filter(v => {
            if (v.status !== 'posted') return false;
            const lastPost = v.postingHistory?.length > 0
                ? v.postingHistory[v.postingHistory.length - 1]
                : null;
            return lastPost && new Date(lastPost.timestamp) < cutoffDate;
        });
    }

    res.json(vehicles);
});

// @desc    Scrape and create a vehicle
// @route   POST /api/vehicles/scrape
// @access  Protected/Admin
router.post('/scrape', protect, admin, async (req, res) => {
    const { url, assignedUserId } = req.body;

    try {
        const scrapedData = await scrapeVehicle(url);

        const vehicle = await Vehicle.create({
            ...scrapedData,
            organization: req.user.organization._id,
            assignedUser: assignedUserId || null,
        });

        res.status(201).json(vehicle);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// @desc    Generate AI content for a vehicle
// @route   POST /api/vehicles/:id/generate-ai
// @access  Protected
router.post('/:id/generate-ai', protect, async (req, res) => {
    const { instructions, sentiment } = req.body;
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    // Ensure user can access this vehicle
    if (req.user.role === 'agent' && vehicle.assignedUser.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Not authorized to access this vehicle');
    }

    try {
        const aiContent = await generateVehicleContent(vehicle, instructions, sentiment);
        vehicle.aiContent = {
            ...aiContent,
            lastGenerated: Date.now(),
        };
        await vehicle.save();
        res.json(vehicle);
    } catch (error) {
        res.status(500).json({ message: 'AI Generation failed' });
    }
});

// @desc    Record a posting action
// @route   POST /api/vehicles/:id/posted
// @access  Protected
router.post('/:id/posted', protect, async (req, res) => {
    const { platform, listingUrl, action } = req.body;
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    vehicle.status = 'posted';
    vehicle.postingHistory.push({
        platform,
        listingUrl,
        action,
        agentName: req.user.name,
    });

    await vehicle.save();
    res.json({ success: true, vehicle });
});


// @desc    Bulk Scrape and create vehicles
// @route   POST /api/vehicles/scrape-bulk
// @access  Protected/Admin
router.post('/scrape-bulk', protect, admin, async (req, res) => {
    const { urls, assignedUserId } = req.body;

    if (!urls || !Array.isArray(urls)) {
        res.status(400);
        throw new Error('Urls array is required');
    }

    const results = {
        total: urls.length,
        success: 0,
        failed: 0,
        items: []
    };

    // Process with a queue to support dynamic expansion
    const queue = [...urls];
    const processed = new Set();

    while (queue.length > 0) {
        const url = queue.shift();

        if (!url || typeof url !== 'string') continue;
        const trimmedUrl = url.trim();

        if (!trimmedUrl) continue;
        if (processed.has(trimmedUrl)) continue;

        processed.add(trimmedUrl);

        try {
            const result = await scrapeVehicle(trimmedUrl);

            // Handle Bulk Vehicles (Search Page with Full Data)
            if (result.type === 'bulk_vehicles') {
                if (result.vehicles && result.vehicles.length > 0) {
                    results.items.push({
                        url: trimmedUrl,
                        status: 'expanded',
                        info: `Found ${result.vehicles.length} vehicles with full data. Processing...`
                    });

                    // Add vehicles directly to queue for saving
                    for (const vehicleData of result.vehicles) {
                        // Check for duplicates
                        const existing = await Vehicle.findOne({
                            organization: req.user.organization._id,
                            $or: [
                                { vin: vehicleData.vin },
                                { sourceUrl: vehicleData.sourceUrl }
                            ]
                        });

                        if (existing && vehicleData.vin) {
                            results.failed++;
                            results.items.push({
                                url: vehicleData.sourceUrl,
                                status: 'failed',
                                error: `Vehicle with VIN ${vehicleData.vin} already exists.`
                            });
                            continue;
                        }

                        try {
                            const vehicle = await Vehicle.create({
                                ...vehicleData,
                                organization: req.user.organization._id,
                                assignedUser: assignedUserId || null,
                            });

                            results.success++;
                            results.items.push({
                                url: vehicleData.sourceUrl,
                                status: 'success',
                                vehicleId: vehicle._id,
                                title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`
                            });
                        } catch (err) {
                            results.failed++;
                            results.items.push({
                                url: vehicleData.sourceUrl,
                                status: 'failed',
                                error: err.message
                            });
                        }
                    }
                }
                continue;
            }

            // Handle Expansion (Search Result with URLs only)
            if (result.type === 'expanded_search') {
                if (result.urls && result.urls.length > 0) {
                    // Add to queue
                    queue.push(...result.urls);
                    results.items.push({
                        url: trimmedUrl,
                        status: 'expanded',
                        info: `Found ${result.urls.length} listings. Added to queue.`
                    });
                } else {
                    results.items.push({
                        url: trimmedUrl,
                        status: 'warning',
                        info: 'Search page found but no vehicles extracted.'
                    });
                }
                continue;
            }

            // Regular Vehicle Result
            const scrapedData = result;

            // Duplicate Check: Check standard VIN or SourceURL
            const existing = await Vehicle.findOne({
                organization: req.user.organization._id,
                $or: [
                    { vin: scrapedData.vin },
                    { sourceUrl: trimmedUrl } // Fallback if no vin
                ]
            });

            if (existing && scrapedData.vin) {
                results.failed++;
                results.items.push({ url: trimmedUrl, status: 'failed', error: `Vehicle with VIN ${scrapedData.vin} already exists.` });
                continue;
            }

            const vehicle = await Vehicle.create({
                ...scrapedData,
                organization: req.user.organization._id,
                assignedUser: assignedUserId || null,
            });

            results.success++;
            results.items.push({ url: trimmedUrl, status: 'success', vehicleId: vehicle._id, title: `${vehicle.year} ${vehicle.make} ${vehicle.model}` });

        } catch (error) {
            results.failed++;
            results.items.push({ url: trimmedUrl, status: 'failed', error: error.message });
        }
    }

    res.json(results);
});

export default router;
