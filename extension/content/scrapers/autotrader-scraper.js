// autotrader-scraper.js
// Content script for scraping vehicle data from Autotrader.com

(function() {
  'use strict';

  console.log('Autotrader scraper loaded');

  // Listen for scrape messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape' && request.scraper === 'autotrader') {
      try {
        const vehicleData = scrapeAutotrader();
        sendResponse({ success: true, data: vehicleData });
      } catch (error) {
        console.error('Autotrader scraping error:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Keep channel open for async response
    }
  });

  function scrapeAutotrader() {
    const data = {
      source: 'autotrader',
      scrapedAt: new Date().toISOString(),
      url: window.location.href
    };

    // Year - Multiple possible selectors
    data.year = getTextContent([
      '[data-cmp="year"]',
      '.heading-3.heading-base span',
      'span[class*="year"]'
    ]) || extractFromTitle('year');

    // Make
    data.make = getTextContent([
      '[data-cmp="make"]',
      'h1.heading-2 span:first-child',
      '[class*="make"]'
    ]) || extractFromTitle('make');

    // Model
    data.model = getTextContent([
      '[data-cmp="model"]',
      'h1.heading-2 span:nth-child(2)',
      '[class*="model"]'
    ]) || extractFromTitle('model');

    // Trim
    data.trim = getTextContent([
      '[data-cmp="trim"]',
      'h1.heading-2 span:last-child',
      '[class*="trim"]'
    ]);

    // Price
    data.price = getTextContent([
      '[data-cmp="vdpPrice"]',
      '.first-price',
      '[class*="price"]',
      'span[class*="Price"]'
    ]) || extractPrice();

    // Mileage
    data.mileage = getTextContent([
      '[data-cmp="mileage"]',
      '[data-cmp="vehicleMileage"]',
      'div[class*="mileage"]'
    ]) || extractMileage();

    // VIN
    data.vin = getTextContent([
      '[data-cmp="vin"]',
      'span[class*="vin"]',
      '[class*="VIN"]'
    ]) || extractVIN();

    // Exterior Color
    data.exteriorColor = getTextContent([
      '[data-cmp="exteriorColor"]',
      'div:contains("Exterior Color") + div',
      '[class*="exteriorColor"]'
    ]);

    // Interior Color
    data.interiorColor = getTextContent([
      '[data-cmp="interiorColor"]',
      'div:contains("Interior Color") + div',
      '[class*="interiorColor"]'
    ]);

    // Drivetrain
    data.drivetrain = getTextContent([
      '[data-cmp="drivetrain"]',
      'div:contains("Drivetrain") + div'
    ]);

    // Transmission
    data.transmission = getTextContent([
      '[data-cmp="transmission"]',
      'div:contains("Transmission") + div'
    ]);

    // Engine
    data.engine = getTextContent([
      '[data-cmp="engine"]',
      'div:contains("Engine") + div'
    ]);

    // MPG
    data.mpg = getTextContent([
      '[data-cmp="mpgCity"]',
      'div:contains("MPG") + div'
    ]);

    // Condition (New/Used)
    data.condition = getTextContent([
      '[data-cmp="inventoryType"]',
      'span[class*="condition"]'
    ]);

    // Dealer Name
    data.dealerName = getTextContent([
      '[data-cmp="dealerName"]',
      'h3[class*="dealer"]',
      '[class*="sellerName"]'
    ]);

    // Dealer Phone
    data.dealerPhone = getTextContent([
      '[data-cmp="phoneNumber"]',
      'a[href^="tel:"]'
    ]);

    // Dealer Address
    data.dealerAddress = getTextContent([
      '[data-cmp="dealerAddress"]',
      'div[class*="address"]'
    ]);

    // Stock Number
    data.stockNumber = getTextContent([
      '[data-cmp="stockNumber"]',
      'div:contains("Stock") + div'
    ]);

    // Description
    data.description = getTextContent([
      '[data-cmp="vdpComments"]',
      'div[class*="description"]',
      '[class*="comments"]'
    ]);

    // Images - High resolution
    data.images = scrapeImages();

    // Features
    data.features = scrapeFeatures();

    // Clean up data
    cleanData(data);

    return data;
  }

  function getTextContent(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    return null;
  }

  function extractFromTitle(field) {
    const title = document.querySelector('h1');
    if (!title) return null;
    
    const text = title.textContent;
    const match = text.match(/(\d{4})\s+([A-Za-z]+)\s+([A-Za-z0-9\s-]+)/);
    
    if (match) {
      const mapping = { year: match[1], make: match[2], model: match[3] };
      return mapping[field];
    }
    return null;
  }

  function extractPrice() {
    const priceRegex = /\$[\d,]+/;
    const bodyText = document.body.textContent;
    const match = bodyText.match(priceRegex);
    return match ? match[0] : null;
  }

  function extractMileage() {
    const mileageRegex = /([\d,]+)\s*mi/i;
    const bodyText = document.body.textContent;
    const match = bodyText.match(mileageRegex);
    return match ? match[0] : null;
  }

  function extractVIN() {
    const vinRegex = /\b[A-HJ-NPR-Z0-9]{17}\b/;
    const bodyText = document.body.textContent;
    const match = bodyText.match(vinRegex);
    return match ? match[0] : null;
  }

  function scrapeImages() {
    const images = [];
    const selectors = [
      'img[data-cmp="media"]',
      'img[class*="media"]',
      'img[class*="carousel"]',
      'img[src*="vehicle"]',
      'picture img'
    ];

    const seenUrls = new Set();
    
    selectors.forEach(selector => {
      const imgElements = document.querySelectorAll(selector);
      imgElements.forEach(img => {
        let src = img.src || img.dataset.src || img.dataset.original;
        
        // Get highest resolution version
        if (src) {
          // Replace thumbnail indicators with full size
          src = src.replace(/\/\d+x\d+\//, '/1920x1440/')
                   .replace(/_small/, '_large')
                   .replace(/_thumb/, '_full');
          
          if (!seenUrls.has(src) && src.includes('http')) {
            images.push(src);
            seenUrls.add(src);
          }
        }
      });
    });

    return images.slice(0, 24); // Facebook limit
  }

  function scrapeFeatures() {
    const features = [];
    const featureSelectors = [
      '[data-cmp="features"] li',
      'ul[class*="feature"] li',
      'div[class*="feature"] span'
    ];

    featureSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const text = el.textContent.trim();
        if (text && !features.includes(text)) {
          features.push(text);
        }
      });
    });

    return features;
  }

  function cleanData(data) {
    // Remove dollar signs and commas from price
    if (data.price) {
      data.price = data.price.replace(/[$,]/g, '');
    }

    // Remove 'mi' from mileage and commas
    if (data.mileage) {
      data.mileage = data.mileage.replace(/[,mi]/gi, '').trim();
    }

    // Clean phone number
    if (data.dealerPhone) {
      data.dealerPhone = data.dealerPhone.replace(/[^\d]/g, '');
    }

    // Remove extra whitespace from all fields
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') {
        data[key] = data[key].replace(/\s+/g, ' ').trim();
      }
    });
  }

})();
