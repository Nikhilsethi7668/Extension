import express from 'express';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @desc    Get test data for Facebook Marketplace form filling
// @route   GET /api/test-data
// @access  Protected (optional - can be public for testing)
router.get('/', async (req, res) => {
    try {
        // Default test data
        const testData = {
            year: '2024',
            make: 'Honda',
            model: 'Civic',
            mileage: '15000',
            price: '25000',
            dealerAddress: 'New York, NY',
            title: '2024 Honda Civic',
            description: 'Excellent condition 2023 Toyota Camry. Well maintained, single owner. All service records available. No accidents. Perfect for daily commute or family use. Contact for more details!',
            images: [
                'https://images.pexels.com/photos/112460/pexels-photo-112460.jpeg',
                'https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg'
            ],
            exteriorColor: 'Black',
            interiorColor: 'Grey',
            fuelType: 'Petrol',
            condition: 'Good',
            bodyStyle: 'Saloon',
            transmission: 'Automatic transmission',
            config: {
                category: 'Car/van',
            }
        };

        res.json({
            success: true,
            data: testData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// @desc    Get test data with custom parameters
// @route   POST /api/test-data
// @access  Protected (optional - can be public for testing)
router.post('/', async (req, res) => {
    try {
        // Get custom data from request body, use defaults if not provided
        const {
            year = '2023',
            make = 'Toyota',
            model = 'Camry',
            mileage = '15000',
            price = '25000',
            dealerAddress = 'New York, NY',
            title,
            description,
            images,
            exteriorColor = 'Black',
            interiorColor = 'Grey',
            fuelType = 'Petrol',
            condition = 'Good',
            bodyStyle = 'Saloon',
            transmission = 'Automatic transmission',
            category = 'Car/van'
        } = req.body;

        // Generate title if not provided
        const generatedTitle = title || `${year} ${make} ${model}`;

        // Generate description if not provided
        const generatedDescription = description || 
            `Excellent condition ${year} ${make} ${model}. Well maintained, single owner. All service records available. No accidents. Perfect for daily commute or family use. Contact for more details!`;

        // Default images if not provided
        const defaultImages = images || [
            'https://images.pexels.com/photos/112460/pexels-photo-112460.jpeg',
            'https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg'
        ];

        const testData = {
            year,
            make,
            model,
            mileage,
            price,
            dealerAddress,
            title: generatedTitle,
            description: generatedDescription,
            images: defaultImages,
            exteriorColor,
            interiorColor,
            fuelType,
            condition,
            bodyStyle,
            transmission,
            config: {
                category,
            }
        };

        res.json({
            success: true,
            data: testData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;

