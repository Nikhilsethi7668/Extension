import axios from 'axios';
import * as cheerio from 'cheerio';

export const scrapeVehicle = async (url) => {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        const $ = cheerio.load(data);
        const domain = new URL(url).hostname;

        const vehicle = {
            sourceUrl: url,
            images: [],
        };

        // Helper to clean price
        const cleanPrice = (text) => {
            if (!text) return null;
            return parseInt(text.replace(/[^0-9]/g, ''));
        };

        if (domain.includes('autotrader.com')) {
            // Autotrader Strategies
            vehicle.year = parseInt($('[data-cmp="heading"]').text().match(/\d{4}/)?.[0]) ||
                parseInt($('h1').text().match(/\d{4}/)?.[0]);
            vehicle.make = $('meta[name="make"]').attr('content'); // Often in meta
            vehicle.model = $('meta[name="model"]').attr('content');
            vehicle.price = cleanPrice($('[data-cmp="pricing"]').text()) || cleanPrice($('.first-price').text());
            vehicle.mileage = cleanPrice($('[data-cmp="mileage"]').text());

            const extractedVin = $('span:contains("VIN")').next().text().trim();
            vehicle.vin = extractedVin || undefined; // Use undefined to skip uniqueness check if missing

            // Images (often in a JSON object in script tags for SPAs)
            // Fallback to og:image
            const ogImage = $('meta[property="og:image"]').attr('content');
            if (ogImage) vehicle.images.push(ogImage);

        } else if (domain.includes('cars.com')) {
            // Cars.com Strategies
            vehicle.title = $('h1.listing-title').text().trim();
            if (vehicle.title) {
                const parts = vehicle.title.split(' ');
                vehicle.year = parseInt(parts[0]);
                vehicle.make = parts[1];
                vehicle.model = parts.slice(2).join(' '); // Rough approx
            }
            vehicle.price = cleanPrice($('.primary-price').text());
            vehicle.mileage = cleanPrice($('.listing-mileage').text());

            // Images
            $('img.swipe-main-image').each((i, el) => {
                const src = $(el).attr('src');
                if (src) vehicle.images.push(src);
            });
        } else {
            // Generic Fallback (Meta Tags)
            vehicle.year = parseInt($('meta[property="og:title"]').attr('content')?.match(/\d{4}/)?.[0]);
            const title = $('meta[property="og:title"]').attr('content') || $('title').text();
            vehicle.description = $('meta[property="og:description"]').attr('content');
            vehicle.price = cleanPrice($('meta[property="product:price:amount"]').attr('content'));

            if ($('meta[property="og:image"]').attr('content')) {
                vehicle.images.push($('meta[property="og:image"]').attr('content'));
            }
        }

        // Final Validation - Ensure we actually got a vehicle
        if ((!vehicle.year && !vehicle.price) || (!vehicle.make && !vehicle.title)) {
            throw new Error("Could not detect vehicle details. Please ensure the URL is a specific vehicle listing page, not a search result or homepage.");
        }

        if (vehicle.vin === '') vehicle.vin = undefined; // Global safety for Unique Index
        if (!vehicle.year) vehicle.year = new Date().getFullYear();
        if (!vehicle.description) vehicle.description = "Please contact for more details.";

        return vehicle;
    } catch (error) {
        console.error(`Scraping error for ${url}:`, error.message);
        throw new Error(`Failed to scrape: ${error.message}`);
    }
};
