import axios from 'axios';
import * as cheerio from 'cheerio';

export const scrapeVehicle = async (url, options = {}) => {
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

        // --- Brown Boys Auto Listing Detection ---
        if (url.includes('brownboysauto.com') && (url.includes('/cars') || url.includes('/inventory') || url.includes('Minyear'))) {
            const vehicleUrls = [];

            // Extract links: look for detail page patterns
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && (href.includes('/inventory/') && href.match(/[0-9]{4}/))) {
                    // Normalize URL
                    if (href.startsWith('http')) {
                        vehicleUrls.push(href);
                    } else {
                        vehicleUrls.push(new URL(href, url).toString());
                    }
                }
                // Also try generic /cars/id pattern if exists
                else if (href && href.match(/\/cars\/[0-9]+$/)) {
                    if (href.startsWith('http')) {
                        vehicleUrls.push(href);
                    } else {
                        vehicleUrls.push(new URL(href, url).toString());
                    }
                }
            });

            const distinctUrls = [...new Set(vehicleUrls)];
            if (distinctUrls.length > 0) {
                return { type: 'expanded_search', urls: distinctUrls };
            }
        }

        // --- Search Page Detection (Autotrader) ---
        if (url.includes('autotrader.com') && (url.includes('all-cars') || url.includes('cars-for-sale/searchresults'))) {
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
                let distinctUrls = [...new Set(vehicleUrls)];

                // --- Pagination Logic ---
                // If we have a limit and haven't reached it, fetch next pages
                let pageNum = 1;
                const pageSize = vehicleUrls.length; // Approximate page size from first page
                let offset = pageSize;

                while (options.limit && distinctUrls.length < options.limit) {
                    try {
                        console.log(`Pagination: Fetching offset ${offset} (Current: ${distinctUrls.length}/${options.limit})...`);

                        const nextUrl = new URL(url);
                        nextUrl.searchParams.set('firstRecord', offset.toString());

                        const { data: nextData } = await axios.get(nextUrl.toString(), {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
                            }
                        });

                        const $next = cheerio.load(nextData);
                        const nextDataScript = $next('#__NEXT_DATA__').html();

                        let newUrlsFound = [];

                        if (nextDataScript) {
                            const json = JSON.parse(nextDataScript);
                            const eggsState = json.props?.pageProps?.__eggsState;
                            if (eggsState?.inventory) {
                                Object.values(eggsState.inventory).forEach(v => {
                                    if (v.id) newUrlsFound.push(`https://www.autotrader.com/cars-for-sale/vehicle/${v.id}`);
                                });
                            }
                        }

                        if (newUrlsFound.length === 0) {
                            console.log('Pagination: No more vehicles found on next page.');
                            break;
                        }

                        distinctUrls = [...new Set([...distinctUrls, ...newUrlsFound])];
                        offset += newUrlsFound.length; // Increment offset by actual count found

                        // Safety break (avoid infinite loops if size doesn't change)
                        if (pageNum++ > 20) break;

                    } catch (err) {
                        console.error('Pagination Error:', err.message);
                        break;
                    }
                }

                if (options.limit && distinctUrls.length > options.limit) {
                    distinctUrls = distinctUrls.slice(0, options.limit);
                }
                return { type: 'expanded_search', urls: distinctUrls };
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

                    // Location
                    if (v.location) {
                        if (typeof v.location === 'string') {
                            vehicle.location = v.location;
                        } else if (v.location.city && v.location.state) {
                            vehicle.location = `${v.location.city}, ${v.location.state}${v.location.zipCode ? ' ' + v.location.zipCode : ''}`;
                        }
                    } else if (v.dealer?.location) {
                        const loc = v.dealer.location;
                        if (typeof loc === 'string') {
                            vehicle.location = loc;
                        } else if (loc.city && loc.state) {
                            vehicle.location = `${loc.city}, ${loc.state}${loc.zipCode ? ' ' + loc.zipCode : ''}`;
                        }
                    }

                    // Condition (New/Used)
                    if (v.condition) {
                        vehicle.condition = typeof v.condition === 'object' ? v.condition.name : v.condition;
                    } else if (v.isNew !== undefined) {
                        vehicle.condition = v.isNew ? 'New' : 'Used';
                    }

                    // Fuel Type
                    if (v.fuelType) {
                        vehicle.fuelType = typeof v.fuelType === 'object' ? v.fuelType.name : v.fuelType;
                    } else if (v.engine) {
                        const engine = typeof v.engine === 'string' ? v.engine : v.engine.name || '';
                        const engineLower = engine.toLowerCase();
                        if (engineLower.includes('diesel')) vehicle.fuelType = 'Diesel';
                        else if (engineLower.includes('electric') || engineLower.includes('ev')) vehicle.fuelType = 'Electric';
                        else if (engineLower.includes('plug') || engineLower.includes('phev')) vehicle.fuelType = 'Plug-in hybrid';
                        else if (engineLower.includes('hybrid')) vehicle.fuelType = 'Hybrid';
                        else if (engineLower.includes('flex')) vehicle.fuelType = 'Flex';
                        else if (engineLower.includes('gas') || engineLower.includes('petrol')) vehicle.fuelType = 'Petrol';
                    }

                    // Transmission
                    if (v.transmission) {
                        const trans = typeof v.transmission === 'object' ? v.transmission.name : v.transmission;
                        const transLower = trans.toLowerCase();
                        if (transLower.includes('automatic') || transLower.includes('auto')) {
                            vehicle.transmission = 'Automatic transmission';
                        } else if (transLower.includes('manual')) {
                            vehicle.transmission = 'Manual transmission';
                        } else {
                            vehicle.transmission = trans;
                        }
                    }

                    // Exterior Color
                    if (v.exteriorColor) {
                        vehicle.exteriorColor = typeof v.exteriorColor === 'object' ? v.exteriorColor.name : v.exteriorColor;
                    }

                    // Interior Color
                    if (v.interiorColor) {
                        vehicle.interiorColor = typeof v.interiorColor === 'object' ? v.interiorColor.name : v.interiorColor;
                    }

                    // Body Style
                    if (v.bodyStyle) {
                        vehicle.bodyStyle = typeof v.bodyStyle === 'object' ? v.bodyStyle.name : v.bodyStyle;
                    } else if (v.vehicleStyle) {
                        vehicle.bodyStyle = typeof v.vehicleStyle === 'object' ? v.vehicleStyle.name : v.vehicleStyle;
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

        // ============ HTML FALLBACK EXTRACTION ============
        // If location or fuel type not found in JSON, extract from HTML

        // Extract Location from HTML (e.g., "Miami, FL 33143 (0 mi away)")
        if (!vehicle.location) {
            try {
                // Strategy 0: Specific Selector from User HTML
                const locationContainer = $('[data-cmp="listingTitleContainer"]');
                if (locationContainer.length) {
                    const text = locationContainer.text();
                    const match = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s([A-Z]{2})\s(\d{5})/);
                    if (match) {
                        vehicle.location = `${match[1]}, ${match[2]} ${match[3]}`;
                        console.log('Location extracted from selector:', vehicle.location);
                    }
                }

                // Strategy 1: Look for location text pattern with city, state, zip
                const locationText = $('body').text();
                const locationMatch = locationText.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s([A-Z]{2})\s(\d{5})(?:\s\(\d+\smi\saway\))?/);
                if (locationMatch) {
                    vehicle.location = `${locationMatch[1]}, ${locationMatch[2]} ${locationMatch[3]}`;
                    console.log('Location extracted from HTML:', vehicle.location);
                }

                // Strategy 2: Look for dealer location in heading
                if (!vehicle.location) {
                    $('h1, h2, h3, .heading-3, [data-cmp="heading"]').each((i, el) => {
                        const text = $(el).text();
                        const match = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s([A-Z]{2})\s(\d{5})/);
                        if (match) {
                            vehicle.location = `${match[1]}, ${match[2]} ${match[3]}`;
                            console.log('Location extracted from heading:', vehicle.location);
                            return false; // break
                        }
                    });
                }
            } catch (e) {
                console.error('Error extracting location from HTML:', e);
            }
        }

        // Extract Fuel Type from HTML specs section
        if (!vehicle.fuelType) {
            try {
                // Strategy 0: Specific Selector
                const fuelTypeDiv = $('div:contains("Fuel Type") + div, [data-cmp="fuelType"]');
                if (fuelTypeDiv.length && fuelTypeDiv.text().trim()) {
                    vehicle.fuelType = fuelTypeDiv.text().trim();
                    console.log('Fuel type extracted from selector:', vehicle.fuelType);
                }

                // Look for engine/fuel info in specs sections
                const specsText = $('[data-cmp="subheading"]:contains("Specs")').parent().text();

                if (specsText.toLowerCase().includes('diesel')) {
                    vehicle.fuelType = 'Diesel';
                } else if (specsText.toLowerCase().includes('electric') || specsText.toLowerCase().includes('ev motor')) {
                    vehicle.fuelType = 'Electric';
                } else if (specsText.toLowerCase().includes('plug-in') || specsText.toLowerCase().includes('phev')) {
                    vehicle.fuelType = 'Plug-in hybrid';
                } else if (specsText.toLowerCase().includes('hybrid')) {
                    vehicle.fuelType = 'Hybrid';
                } else if (specsText.toLowerCase().includes('flex fuel')) {
                    vehicle.fuelType = 'Flex';
                } else if (specsText.toLowerCase().includes('gas') || specsText.toLowerCase().includes('petrol') || specsText.toLowerCase().includes('gasoline')) {
                    vehicle.fuelType = 'Petrol';
                }

                if (vehicle.fuelType) {
                    console.log('Fuel type extracted from HTML specs:', vehicle.fuelType);
                }

                // Fallback: Check vehicle description for fuel type keywords
                if (!vehicle.fuelType && vehicle.description) {
                    const descLower = vehicle.description.toLowerCase();
                    if (descLower.includes('diesel')) vehicle.fuelType = 'Diesel';
                    else if (descLower.includes('electric') || descLower.includes('ev')) vehicle.fuelType = 'Electric';
                    else if (descLower.includes('hybrid')) vehicle.fuelType = 'Hybrid';

                    if (vehicle.fuelType) {
                        console.log('Fuel type extracted from description:', vehicle.fuelType);
                    }
                }
            } catch (e) {
                console.error('Error extracting fuel type from HTML:', e);
            }
        }

        // Extract Condition from HTML if not found
        if (!vehicle.condition) {
            try {
                const bodyText = $('body').text();
                if (bodyText.toLowerCase().includes('new arrival') || bodyText.toLowerCase().includes('brand new')) {
                    vehicle.condition = 'New';
                } else if (bodyText.toLowerCase().includes('used') || bodyText.toLowerCase().includes('pre-owned')) {
                    vehicle.condition = 'Used';
                }

                if (vehicle.condition) {
                    console.log('Condition extracted from HTML:', vehicle.condition);
                }
            } catch (e) {
                console.error('Error extracting condition from HTML:', e);
            }
        }

        // Return vehicle data
        if (!vehicle.make || !vehicle.model) {
            throw new Error('Could not extract vehicle make/model');
        }

        // --- Brown Boys Auto Scraping ---
        if (url.includes('brownboysauto.com')) {
            // Details are often in .vehicle_single_detail_div__container
            $('.vehicle_single_detail_div__container').each((i, el) => {
                const label = $(el).find('span:first-child').text().trim().replace(/:$/, '');
                const valueText = $(el).find('span:last-of-type').text().trim();
                // Handle complex value containers (colors)
                const complexValue = $(el).find('div.d-flex span.d-none').text().trim();
                const value = complexValue || valueText;

                if (label === 'Year') vehicle.year = parseInt(value);
                if (label === 'Make') vehicle.make = value;
                if (label === 'Model') vehicle.model = value;
                if (label === 'Body Style') vehicle.bodyStyle = value;
                if (label === 'Odometer') vehicle.mileage = parseInt(value.replace(/[^0-9]/g, ''));
                if (label === 'Transmission') vehicle.transmission = value;
                if (label === 'Exterior Color') vehicle.exteriorColor = value;
                if (label === 'Interior Color') vehicle.interiorColor = value;
                if (label === 'Vin') vehicle.vin = value;
                if (label === 'Fuel Type') vehicle.fuelType = value;
                if (label === 'Stock Number') vehicle.stockNumber = value;
                if (label === 'Engine') vehicle.engine = value;
            });

            // Images
            $('.image-gallery-slide img').each((i, el) => {
                const src = $(el).attr('src');
                if (src && !vehicle.images.includes(src)) {
                    vehicle.images.push(src);
                }
            });

            // Description
            const desc = $('.DetaileProductCustomrWeb-description-text').text().trim();
            if (desc) vehicle.description = desc;

            // Price fallbacks
            // Attempt to find price in likely locations if not found
            if (!vehicle.price) {
                // Common selectors
                const priceText = $('.price-value, .final-price').text();
                if (priceText) vehicle.price = parseInt(priceText.replace(/[^0-9]/g, ''));
            }

            return vehicle;
        }

        return vehicle;

    } catch (error) {
        throw new Error(`Scraping failed: ${error.message}`);
    }
};
