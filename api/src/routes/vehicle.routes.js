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
    const query = { organization: req.user.organization._id };

    // Agents only see vehicles assigned to them
    if (req.user.role === 'agent') {
        query.assignedUser = req.user._id;
    }

    const vehicles = await Vehicle.find(query).sort('-createdAt');
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

export default router;
