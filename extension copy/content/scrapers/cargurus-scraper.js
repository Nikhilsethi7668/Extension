// cargurus-scraper.js
// Content script for scraping vehicle data from CarGurus.com

(function() {
  'use strict';

  console.log('CarGurus scraper loaded');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape' && request.scraper === 'cargurus') {
      try {
        const vehicleData = scrapeCarGurus();
        sendResponse({ success: true, data: vehicleData });
      } catch (error) {
        console.error('CarGurus scraping error:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });

  function scrapeCarGurus() {
    const data = {
      source: 'cargurus',
      scrapedAt: new Date().toISOString(),
      url: window.location.href
    };

    // Title parsing
    const title = document.querySelector('h1.vdp-header-title, h1');
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
      '.price-section span',
      'span[class*="price"]',
      'div[class*="pricing"]'
    ]) || extractPrice();

    // Mileage
    data.mileage = getTextContent([
      'span:contains("Mileage")',
      'div[class*="mileage"]',
      'dt:contains("Mileage") + dd'
    ]) || extractMileage();

    // VIN
    data.vin = getTextContent([
      'span:contains("VIN")',
      'dt:contains("VIN") + dd',
      'div[class*="vin"]'
    ]) || extractVIN();

    // Exterior Color
    data.exteriorColor = getTextContent([
      'dt:contains("Exterior") + dd',
      'span:contains("Exterior Color")'
    ]);

    // Interior Color
    data.interiorColor = getTextContent([
      'dt:contains("Interior") + dd',
      'span:contains("Interior Color")'
    ]);

    // Drivetrain
    data.drivetrain = getTextContent([
      'dt:contains("Drivetrain") + dd',
      'span:contains("Drivetrain")'
    ]);

    // Transmission
    data.transmission = getTextContent([
      'dt:contains("Transmission") + dd',
      'span:contains("Transmission")'
    ]);

    // Engine
    data.engine = getTextContent([
      'dt:contains("Engine") + dd',
      'span:contains("Engine")'
    ]);

    // MPG
    data.mpg = getTextContent([
      'dt:contains("MPG") + dd',
      'span:contains("MPG")'
    ]);

    // Trim
    data.trim = getTextContent([
      'dt:contains("Trim") + dd',
      'span[class*="trim"]'
    ]);

    // Body Style
    data.bodyStyle = getTextContent([
      'dt:contains("Body") + dd',
      'span[class*="body"]'
    ]);

    // Condition
    data.condition = getTextContent([
      'span[class*="condition"]',
      'div[class*="badge"]'
    ]);

    // Dealer Name
    data.dealerName = getTextContent([
      'h2[class*="dealer"]',
      'div[class*="seller-name"]',
      'a[class*="dealer-link"]'
    ]);

    // Dealer Phone
    data.dealerPhone = getTextContent([
      'a[href^="tel:"]',
      'button[class*="phone"]',
      'span[class*="phone"]'
    ]);

    // Dealer Address
    data.dealerAddress = getTextContent([
      'address',
      'div[class*="dealer-address"]',
      'p[class*="location"]'
    ]);

    // Stock Number
    data.stockNumber = getTextContent([
      'dt:contains("Stock") + dd',
      'span:contains("Stock #")'
    ]);

    // Description
    data.description = getTextContent([
      'div[class*="description"]',
      'p[class*="comments"]',
      'div[class*="seller-comments"]'
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
        // Handle :contains selector
        if (selector.includes(':contains')) {
          const match = selector.match(/(.*):contains\("([^"]+)"\)(.*)/);
          if (match) {
            const [, tagBefore, searchText, tagAfter] = match;
            const elements = document.querySelectorAll(tagBefore || '*');
            
            for (const el of elements) {
              if (el.textContent.includes(searchText)) {
                if (tagAfter === ' + dd') {
                  const next = el.nextElementSibling;
                  if (next && next.tagName === 'DD') {
                    return next.textContent.trim();
                  }
                } else {
                  return el.textContent.trim();
                }
              }
            }
          }
        } else {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
      } catch (e) {
        console.log('Selector error:', selector, e);
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
      'img[class*="gallery"]',
      'img[class*="vehicle"]',
      'picture img',
      'img[src*="cargurus"]'
    ];

    const seenUrls = new Set();
    
    selectors.forEach(selector => {
      const imgElements = document.querySelectorAll(selector);
      imgElements.forEach(img => {
        let src = img.src || img.dataset.src;
        
        if (src) {
          // Get highest resolution
          src = src.replace(/\/\d+x\d+\//, '/1920x1440/')
                   .replace(/_sm\./, '_lg.')
                   .replace(/_thumb\./, '_full.');
          
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
      'ul[class*="features"] li',
      'div[class*="amenities"] li',
      'ul[class*="options"] li'
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
