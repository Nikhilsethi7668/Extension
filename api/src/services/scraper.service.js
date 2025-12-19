import axios from 'axios';
import * as cheerio from 'cheerio';

export const scrapeVehicle = async (url) => {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'max-age=0'
            }
        });

        const $ = cheerio.load(data);
        const domain = new URL(url).hostname;

        // --- Search Page Detection & URL Extraction (for full image galleries) ---
        if (url.includes('all-cars') || url.includes('cars-for-sale/searchresults')) {
            const vehicleUrls = [];

            const nextDataScript = $('#__NEXT_DATA__').html();
            if (nextDataScript) {
                try {
                    const json = JSON.parse(nextDataScript);
                    const eggsState = json.props?.pageProps?.__eggsState;

                    if (eggsState?.inventory) {
                        Object.values(eggsState.inventory).forEach(v => {
                            if (v.id) {
                                vehicleUrls.push(`https://www.autotrader.com/cars-for-sale/vehicle/${v.id}`);
                            }
                        });
                    }
                } catch (e) {
                    console.error('Error parsing search page JSON:', e);
                }
            }

            if (vehicleUrls.length > 0) {
                return { type: 'expanded_search', urls: [...new Set(vehicleUrls)] };
            } else {
                throw new Error('Could not extract vehicle URLs');
            }
        }

        // --- Regular Single Vehicle Scraping with Full Images ---
        const vehicle = {
            sourceUrl: url,
            images: [],
            features: []
        };

        // Helper to clean price
        const cleanPrice = (text) => {
            if (!text) return null;
            if (typeof text === 'number') return text;
            return parseInt(text.toString().replace(/[^0-9]/g, ''));
        };

        // Strategy: Next.js Data Parsing
        const nextDataScript = $('#__NEXT_DATA__').html();
        if (nextDataScript) {
            try {
                const json = JSON.parse(nextDataScript);
                const props = json.props?.pageProps;
                const eggsState = props?.__eggsState;

                // Extract vehicle ID from URL
                const vehicleIdMatch = url.match(/\/vehicle\/(\d+)/);
                const vehicleId = vehicleIdMatch ? vehicleIdMatch[1] : null;

                // Check inventory for vehicle data
                if (vehicleId && eggsState?.inventory?.[vehicleId]) {
                    const v = eggsState.inventory[vehicleId];

                    if (v.year) vehicle.year = parseInt(v.year);
                    if (v.make) vehicle.make = typeof v.make === 'object' ? v.make.name : v.make;
                    if (v.model) vehicle.model = typeof v.model === 'object' ? v.model.name : v.model;
                    if (v.trim) vehicle.trim = typeof v.trim === 'object' ? v.trim.name : v.trim;
                    if (v.vin) vehicle.vin = v.vin;

                    // Price
                    if (v.pricingDetail?.salePrice) {
                        vehicle.price = v.pricingDetail.salePrice;
                    } else if (v.pricingHistory && v.pricingHistory.length > 0) {
                        vehicle.price = cleanPrice(v.pricingHistory[0].price);
                    }

                    // Mileage - handle object or direct value
                    let mileageValue = null;
                    if (v.mileage) {
                        if (typeof v.mileage === 'object' && v.mileage.value) {
                            mileageValue = cleanPrice(v.mileage.value);
                        } else {
                            mileageValue = cleanPrice(v.mileage);
                        }
                    } else if (v.odometer) {
                        mileageValue = cleanPrice(v.odometer);
                    }

                    if (mileageValue && !isNaN(mileageValue)) {
                        vehicle.mileage = mileageValue;
                    }


                    // Description - fullDescription has complete text
                    if (v.fullDescription) {
                        vehicle.description = v.fullDescription
                            .replace(/<br\s*\/?>/gi, '\n')
                            .replace(/<[^>]+>/g, '')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .trim();
                    } else if (v.description) {
                        let desc = typeof v.description === 'object' ? v.description.label : v.description;
                        if (desc) {
                            vehicle.description = desc.replace(/<br\s*\/?>/gi, '\n')
                                .replace(/<[^>]+>/g, '')
                                .replace(/&amp;/g, '&')
                                .trim();
                        }
                    }
                }

                // Images from pageProps.images (FULL GALLERY - 30-40 images)
                if (props?.images?.sources) {
                    props.images.sources.forEach(img => {
                        if (img.src) vehicle.images.push(img.src);
                    });
                }

            } catch (e) {
                console.error('Error parsing Next.js data:', e);
            }
        }

        // Return vehicle data
        if (!vehicle.make || !vehicle.model) {
            throw new Error('Could not extract vehicle make/model');
        }

        return vehicle;

    } catch (error) {
        throw new Error(`Scraping failed: ${error.message}`);
    }
};
