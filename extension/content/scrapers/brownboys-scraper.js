// brownboys-scraper.js
// Content script for scraping vehicle data from Brown Boys Auto (brownboysauto.com)

(function () {
    'use strict';

    console.log('Brown Boys Auto scraper loaded');

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'scrape' && (request.scraper === 'brownboys' || !request.scraper)) {
            try {
                const vehicleData = scrapeBrownBoys();
                sendResponse({ success: true, data: vehicleData });
            } catch (error) {
                console.error('Brown Boys scraping error:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
        // Infinite Scroll Handler for Listing Page
        if (request.action === 'scroll_listing') {
            const scrollInterval = setInterval(() => {
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
                    clearInterval(scrollInterval);
                    sendResponse({ success: true, message: 'Reached bottom' });
                    // In a real scenario, we might need to wait for AJAX to load more and keep scrolling
                } else {
                    window.scrollTo(0, document.body.scrollHeight);
                }
            }, 2000);
            return true;
        }
    });

    function scrapeBrownBoys() {
        const data = {
            source: 'brownboys',
            scrapedAt: new Date().toISOString(),
            url: window.location.href
        };

        // Helper to find detail row value
        function getDetailValue(labelToCheck) {
            const rows = document.querySelectorAll('.vehicle_single_detail_div__container');
            for (const row of rows) {
                const label = row.querySelector('span:first-child')?.textContent?.trim();
                const valueSpan = row.querySelector('span:last-of-type');

                if (label && label.toLowerCase().includes(labelToCheck.toLowerCase())) {
                    // Handle color divs or simple text
                    if (valueSpan) return valueSpan.textContent.trim();
                    // Sometimes color is just a div + span hidden? 
                    // The specific HTML shows: <span>Exterior Color :</span><div ...><span ...>White</span></div>
                    const valueContainer = row.querySelector('div.d-flex.align-items-center');
                    if (valueContainer) {
                        return valueContainer.textContent.trim();
                    }
                }
            }
            return null;
        }

        data.year = getDetailValue('Year') || extractFromTitle(0);
        data.make = getDetailValue('Make') || extractFromTitle(1);
        data.model = getDetailValue('Model') || extractFromTitle(2);
        data.bodyStyle = getDetailValue('Body Style');
        data.mileage = getDetailValue('Odometer');
        data.transmission = getDetailValue('Transmission');
        data.exteriorColor = getDetailValue('Exterior Color');
        data.interiorColor = getDetailValue('Interior Color');
        data.doors = getDetailValue('Doors');
        data.passengers = getDetailValue('Passengers');
        data.fuelType = getDetailValue('Fuel Type');
        data.stockNumber = getDetailValue('Stock Number');
        data.vin = getDetailValue('Vin');
        data.engine = getDetailValue('Engine');
        data.drivetrain = getDetailValue('Drivetrain');

        // Price - Usually not in the details list in the snippet, might be separate
        // Using a generic selector based on inspection of similar sites or likely class
        // Fallback to searching for price symbols
        data.price = document.querySelector('.price-value, .final-price, .internet-price')?.textContent?.trim() ||
            document.body.innerText.match(/\$[0-9,]+/)?.[0];

        // Images
        data.images = scrapeImages();

        // Description
        const descContainer = document.querySelector('.DetaileProductCustomrWeb-description-text');
        if (descContainer) {
            data.description = descContainer.innerText.trim();
        }

        cleanData(data);
        return data;
    }

    function extractFromTitle(index) {
        // If details fail, try title: "2023 Hyundai Elantra"
        const title = document.querySelector('h1')?.textContent?.trim();
        if (title) {
            const parts = title.split(' ');
            if (parts.length > index) return parts[index];
        }
        return null;
    }

    function scrapeImages() {
        const images = [];
        // Select images from the gallery slides
        const imgElements = document.querySelectorAll('.image-gallery-slide img.image-gallery-image');

        const seenUrls = new Set();
        imgElements.forEach(img => {
            let src = img.src;
            if (src && !seenUrls.has(src)) {
                // Try to ensure high res if thumbnail
                // Based on snippet: https://image123.azureedge.net/1452782bcltd/2023-Hyundai-Elantra-7720610853819123.jpg
                // Thumbnails might act differently, but these look like full size in the slide
                images.push(src);
                seenUrls.add(src);
            }
        });

        return images.slice(0, 24);
    }

    function cleanData(data) {
        if (data.price) data.price = data.price.replace(/[$,]/g, '');
        if (data.mileage) data.mileage = data.mileage.replace(/[,KMkm]/gi, '').trim();
        if (data.year) data.year = data.year.toString();

        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'string') {
                data[key] = data[key].trim();
            }
        });
    }

})();
