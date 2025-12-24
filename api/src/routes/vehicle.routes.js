import express from 'express';
import Vehicle from '../models/Vehicle.js';
import { protect, admin } from '../middleware/auth.js';
import { generateVehicleContent, processImageWithGemini } from '../services/ai.service.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

// @desc    Get a single vehicle by ID (formatted for posting)
// @route   GET /api/vehicles/:id
// @access  Protected
router.get('/:id', protect, async (req, res, next) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id).populate('organization').populate('assignedUser');

        if (!vehicle) {
            res.status(404);
            return next(new Error('Vehicle not found'));
        }

        // Ensure vehicle belongs to user's organization
        // Handle both populated and non-populated organization
        const vehicleOrgId = vehicle.organization._id ? vehicle.organization._id.toString() : vehicle.organization.toString();
        const userOrgId = req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString();
        
        if (vehicleOrgId !== userOrgId) {
            console.error('Organization mismatch:', {
                vehicleOrgId,
                userOrgId,
                vehicleId: vehicle._id,
                userId: req.user._id,
                userRole: req.user.role
            });
            res.status(403);
            return next(new Error('Not authorized to access this vehicle - organization mismatch'));
        }

        // Ensure user can access this vehicle (for agents, check if assigned)
        if (req.user.role === 'agent') {
            // If vehicle has an assignedUser, it must match the current user
            if (vehicle.assignedUser) {
                const assignedUserId = vehicle.assignedUser._id ? vehicle.assignedUser._id.toString() : vehicle.assignedUser.toString();
                if (assignedUserId !== req.user._id.toString()) {
                    res.status(403);
                    return next(new Error('Not authorized to access this vehicle - not assigned to you'));
                }
            }
            // If vehicle has no assignedUser, agents can still access it (unassigned vehicles)
        }

        // Transform vehicle data to match testData format for direct posting
        const formattedData = {
            year: vehicle.year ? String(vehicle.year) : ' ',
            make: vehicle.make || ' ',
            model: vehicle.model || ' ',
            mileage: vehicle.mileage ? String(vehicle.mileage) : '0',
            price: vehicle.price ? String(vehicle.price) : '0',
            dealerAddress: vehicle.location || ' ',
            title: vehicle.aiContent?.title || `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Vehicle Listing',
            description: vehicle.description || vehicle.aiContent?.description || 
                `Excellent condition ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}. Well maintained. All service records available. No accidents. Perfect for daily commute or family use. Contact for more details!`,
            images: vehicle.images && vehicle.images.length > 0 
                ? vehicle.images 
                : [
                    'https://images.pexels.com/photos/112460/pexels-photo-112460.jpeg',
                    'https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg'
                ],
            exteriorColor: vehicle.exteriorColor || '',
            interiorColor: vehicle.interiorColor || '',
            fuelType: vehicle.fuelType || ' ',
            condition: vehicle.condition || ' ',
            bodyStyle: vehicle.bodyStyle || ' ',
            transmission: vehicle.transmission || ' ',
            config: {
                category: vehicle.bodyStyle === 'SUV' ? 'SUV' : 
                         vehicle.bodyStyle === 'Truck' ? 'Truck' : 
                         vehicle.bodyStyle === 'Van' ? 'Van' : 
                         vehicle.bodyStyle === 'Motorcycle' ? 'Motorcycle' : 'Car/van'
            }
        };

        // Handle AI Enhancement if query parameter is present
        if (req.query.ai_prompt && process.env.GEMINI_API_KEY) {
            try {
                console.log('Enhancing content with Gemini AI using prompt:', req.query.ai_prompt);
                
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({
                    model: "gemini-flash-latest",
                });

                const prompt = `
                    You are an expert car salesman copywriting assistant. 
                    I need you to write a catchy title and a detailed, selling description for a vehicle listing on Facebook Marketplace.
                    
                    Vehicle Details:
                    Year: ${formattedData.year}
                    Make: ${formattedData.make}
                    Model: ${formattedData.model}
                    Mileage: ${formattedData.mileage}
                    Price: ${formattedData.price}
                    Condition: ${formattedData.condition}
                    
                    User specific instructions: ${req.query.ai_prompt}
                    
                    Return ONLY a JSON object with this exact structure (no markdown, no backticks):
                    {
                        "title": "Your catchy title here",
                        "description": "Your detailed selling description here"
                    }
                `;

                const result = await model.generateContent(prompt);
                const response = result.response;
                const text = response.text().trim().replace(/^```json/, '').replace(/```$/, '');
                
                try {
                    const enhancedContent = JSON.parse(text);
                    if (enhancedContent.title) formattedData.title = enhancedContent.title;
                    if (enhancedContent.description) formattedData.description = enhancedContent.description;
                    console.log('Content enhanced successfully');
                } catch (parseError) {
                    console.error('Failed to parse AI response:', parseError);
                    // Fallback using regex if JSON parse fails
                    const titleMatch = text.match(/"title":\s*"([^"]+)"/);
                    const descMatch = text.match(/"description":\s*"([^"]+)"/);
                    if (titleMatch) formattedData.title = titleMatch[1];
                    if (descMatch) formattedData.description = descMatch[1];
                }

            } catch (aiError) {
                console.error('Gemini API enhancement failed:', aiError);
                // Continue without enhancement, returning original data
            }
        }

        // Return in same format as testData endpoint
        res.json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        res.status(500);
        return next(new Error(error.message));
    }
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

// @desc    Remove background from a vehicle image (Nano Banana Integration)
// @route   POST /api/vehicles/:id/remove-bg
// @access  Protected
router.post('/:id/remove-bg', protect, async (req, res) => {
    const { imageUrl, prompt } = req.body; // Accept prompt from user
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    // Authorization Check
    if (req.user.role === 'agent' && vehicle.assignedUser.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Not authorized to access this vehicle');
    }

    if (!imageUrl) {
        res.status(400);
        throw new Error('Image URL is required');
    }

    try {
        console.log(`Processing background removal for image: ${imageUrl} with prompt: ${prompt || 'Default'}`);
        
        // Use AI Service with Gemini 2.5 Flash
        const aiResult = await processImageWithGemini(imageUrl, prompt);
        const processedImageUrl = aiResult.processedUrl;

        // Update the image in the vehicle record
        const imageIndex = vehicle.images.indexOf(imageUrl);
        if (imageIndex > -1) {
            vehicle.images[imageIndex] = processedImageUrl;
        } else {
            vehicle.images.push(processedImageUrl);
        }

        await vehicle.save();
        
        res.json({
            success: true,
            data: {
                originalUrl: imageUrl,
                processedUrl: processedImageUrl,
                vehicle: vehicle,
                provider: aiResult.provider,
                aiResponse: aiResult.aiResponse
            }
        });

    } catch (error) {
        console.error('Background removal failed:', error);
        res.status(500).json({ message: 'Background removal failed', error: error.message });
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
