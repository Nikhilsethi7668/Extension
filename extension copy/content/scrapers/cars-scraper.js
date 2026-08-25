// cars-scraper.js
// Content script for scraping vehicle data from Cars.com

(function() {
  'use strict';

  console.log('Cars.com scraper loaded');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape' && request.scraper === 'cars') {
      try {
        const vehicleData = scrapeCars();
        sendResponse({ success: true, data: vehicleData });
      } catch (error) {
        console.error('Cars.com scraping error:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });

  function scrapeCars() {
    const data = {
      source: 'cars',
      scrapedAt: new Date().toISOString(),
      url: window.location.href
    };

    // Title parsing
    const title = document.querySelector('h1.listing-title, h1[class*="title"]');
    if (title) {
      const titleText = title.textContent.trim();
      const titleMatch = titleText.match(/(\d{4})\s+([A-Za-z]+)\s+([A-Za-z0-9\s-]+)/);
      if (titleMatch) {
        data.year = titleMatch[1];
        data.make = titleMatch[2];
        data.model = titleMatch[3];
      }
    }

    // Price
    data.price = getTextContent([
      'span.primary-price',
      '[class*="price-section"] span',
      'span[class*="Price"]',
      '.vehicle-pricing'
    ]) || extractPrice();

    // Mileage
    data.mileage = getTextContent([
      '[data-qa="mileage"]',
      'li[class*="mileage"]',
      'div:contains("Mileage") + div'
    ]) || extractMileage();

    // VIN
    data.vin = getTextContent([
      '[data-qa="vin"]',
      'dd[class*="vin"]',
      'div:contains("VIN") + div'
    ]) || extractVIN();

    // Exterior Color
    data.exteriorColor = getTextContent([
      '[data-qa="exterior-color"]',
      'dd[class*="exterior"]',
      'div:contains("Exterior") + div'
    ]);

    // Interior Color
    data.interiorColor = getTextContent([
      '[data-qa="interior-color"]',
      'dd[class*="interior"]',
      'div:contains("Interior") + div'
    ]);

    // Drivetrain
    data.drivetrain = getTextContent([
      '[data-qa="drivetrain"]',
      'dd[class*="drivetrain"]'
    ]);

    // Transmission
    data.transmission = getTextContent([
      '[data-qa="transmission"]',
      'dd[class*="transmission"]'
    ]);

    // Engine
    data.engine = getTextContent([
      '[data-qa="engine"]',
      'dd[class*="engine"]'
    ]);

    // MPG
    data.mpg = getTextContent([
      '[data-qa="mpg"]',
      'dd[class*="mpg"]',
      'div:contains("MPG") + div'
    ]);

    // Condition
    data.condition = getTextContent([
      '[data-qa="condition"]',
      'span[class*="condition"]'
    ]);

    // Dealer Name
    data.dealerName = getTextContent([
      '[data-qa="dealer-name"]',
      'h2[class*="seller"]',
      'div[class*="dealer-name"]'
    ]);

    // Dealer Phone
    data.dealerPhone = getTextContent([
      '[data-qa="phone-number"]',
      'a[href^="tel:"]',
      'button[class*="phone"]'
    ]);

    // Dealer Address
    data.dealerAddress = getTextContent([
      '[data-qa="dealer-address"]',
      'address',
      'div[class*="address"]'
    ]);

    // Stock Number
    data.stockNumber = getTextContent([
      '[data-qa="stock-number"]',
      'dd[class*="stock"]'
    ]);

    // Description
    data.description = getTextContent([
      '[data-qa="description"]',
      'div[class*="comments"]',
      'p[class*="description"]'
    ]);

    // Trim
    data.trim = getTextContent([
      '[data-qa="trim"]',
      'dd[class*="trim"]'
    ]);

    // Body Style
    data.bodyStyle = getTextContent([
      '[data-qa="body-style"]',
      'dd[class*="body"]'
    ]);

    // Images
    data.images = scrapeImages();

    // Features
    data.features = scrapeFeatures();

    // Clean up data
    cleanData(data);

    return data;
  }

  function getTextContent(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      } catch (e) {
        // Try jQuery-style contains selector manually
        if (selector.includes(':contains')) {
          const match = selector.match(/div:contains\("([^"]+)"\)/);
          if (match) {
            const divs = document.querySelectorAll('div');
            for (const div of divs) {
              if (div.textContent.includes(match[1])) {
                const next = div.nextElementSibling;
                if (next && next.textContent.trim()) {
                  return next.textContent.trim();
                }
              }
            }
          }
        }
      }
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
      'img[data-qa="vehicle-image"]',
      'picture img',
      'img[class*="hero"]',
      'img[class*="vehicle"]',
      'img[src*="cloudfront"]'
    ];

    const seenUrls = new Set();
    
    selectors.forEach(selector => {
      const imgElements = document.querySelectorAll(selector);
      imgElements.forEach(img => {
        let src = img.src || img.dataset.src || img.srcset?.split(' ')[0];
        
        if (src) {
          // Get highest resolution
          src = src.replace(/\/\d+x\d+\//, '/1920x1440/')
                   .replace(/_small/, '_large')
                   .replace(/_medium/, '_large');
          
          if (!seenUrls.has(src) && src.includes('http')) {
            images.push(src);
            seenUrls.add(src);
          }
        }
      });
    });

    return images.slice(0, 24);
  }

  function scrapeFeatures() {
    const features = [];
    const featureSelectors = [
      '[data-qa="features"] li',
      'ul[class*="feature"] li',
      'div[class*="amenities"] li'
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
    if (data.price) {
      data.price = data.price.replace(/[$,]/g, '');
    }

    if (data.mileage) {
      data.mileage = data.mileage.replace(/[,mi]/gi, '').trim();
    }

    if (data.dealerPhone) {
      data.dealerPhone = data.dealerPhone.replace(/[^\d]/g, '');
    }

    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') {
        data[key] = data[key].replace(/\s+/g, ' ').trim();
      }
    });
  }

})();
