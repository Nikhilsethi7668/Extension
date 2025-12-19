
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

    // Process sequentially to be nice to servers
    for (const url of urls) {
        if (!url || typeof url !== 'string') continue;
        const trimmedUrl = url.trim();
        if (!trimmedUrl) continue;

        try {
            const scrapedData = await scrapeVehicle(trimmedUrl);

            // Duplicate Check: Check standard VIN or SourceURL
            const existing = await Vehicle.findOne({
                organization: req.user.organization._id,
                $or: [
                    { vin: scrapedData.vin }, // Match by VIN
                    { sourceUrl: trimmedUrl } // Match by URL
                ]
            });

            // If VIN exists, we only skip if it's truly a VIN and not undefined
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
