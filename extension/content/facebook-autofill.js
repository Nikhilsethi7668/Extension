// facebook-autofill.js
// Content script that automatically fills Facebook Marketplace vehicle listing forms
// Uses MutationObserver to detect DOM changes and fill fields dynamically

(function() {
  'use strict';

  console.log('Facebook Marketplace Auto-Fill Agent Loaded');

  let pendingPost = null;
  let fillAttempts = 0;
  const MAX_ATTEMPTS = 30;
  let observer = null;

  // Initialize the autofill agent
  init();

  async function init() {
    // Load pending post data
    const stored = await chrome.storage.local.get(['pendingPost']);
    if (stored.pendingPost) {
      pendingPost = stored.pendingPost;
      console.log('Loaded pending post:', pendingPost);
      
      // Start observing DOM for form elements
      startObserver();
      
      // Try initial fill after delay
      setTimeout(() => attemptAutoFill(), 2000);
    } else {
      console.log('No pending post data found');
    }
  }

  function startObserver() {
    // MutationObserver to detect when form elements are loaded
    observer = new MutationObserver((mutations) => {
      if (fillAttempts < MAX_ATTEMPTS) {
        attemptAutoFill();
      } else if (observer) {
        observer.disconnect();
        console.log('Max fill attempts reached');
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function attemptAutoFill() {
    fillAttempts++;
    console.log(`Auto-fill attempt ${fillAttempts}/${MAX_ATTEMPTS}`);

    // Check if we're on the vehicle listing page
    if (!window.location.href.includes('marketplace/create')) {
      return;
    }

    try {
      // Wait for form to be ready
      await waitForElement('[role="dialog"], form, [data-pagelet]', 2000);
      
      // Fill different form sections based on what's visible
      await fillVehicleCategory();
      await fillYear();
      await fillMake();
      await fillModel();
      await fillMileage();
      await fillVIN();
      await fillPrice();
      await fillTitle();
      await fillDescription();
      await fillLocation();
      await fillCondition();
      await fillTransmission();
      await fillDrivetrain();
      await fillFuelType();
      await fillExteriorColor();
      await fillInteriorColor();
      
      // Handle images
      await handleImages();
      
      // Notify user of progress
      sendProgressUpdate('Auto-fill in progress...');
      
    } catch (error) {
      console.error('Auto-fill error:', error);
    }
  }

  // ============ Field Filling Functions ============

  async function fillVehicleCategory() {
    // Look for vehicle type selector
    const selectors = [
      'input[placeholder*="vehicle" i]',
      'input[placeholder*="car" i]',
      'select[aria-label*="category" i]',
      'button[aria-label*="vehicle" i]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) {
        simulateClick(element);
        await sleep(500);
        
        // Try to select "Vehicle" option
        const vehicleOption = findElementByText(['Vehicle', 'Car', 'Automobile']);
        if (vehicleOption) {
          simulateClick(vehicleOption);
          await sleep(500);
        }
        break;
      }
    }
  }

  async function fillYear() {
    if (!pendingPost.year) return;
    
    const selectors = [
      'input[placeholder*="year" i]',
      'input[aria-label*="year" i]',
      'input[name*="year" i]'
    ];

    await fillInput(selectors, pendingPost.year);
  }

  async function fillMake() {
    if (!pendingPost.make) return;
    
    const selectors = [
      'input[placeholder*="make" i]',
      'input[aria-label*="make" i]',
      'input[placeholder*="brand" i]'
    ];

    await fillInput(selectors, pendingPost.make);
  }

  async function fillModel() {
    if (!pendingPost.model) return;
    
    const selectors = [
      'input[placeholder*="model" i]',
      'input[aria-label*="model" i]'
    ];

    await fillInput(selectors, pendingPost.model);
  }

  async function fillMileage() {
    if (!pendingPost.mileage) return;
    
    const selectors = [
      'input[placeholder*="mileage" i]',
      'input[aria-label*="mileage" i]',
      'input[placeholder*="odometer" i]'
    ];

    const mileage = pendingPost.mileage.replace(/[^\d]/g, '');
    await fillInput(selectors, mileage);
  }

  async function fillVIN() {
    if (!pendingPost.vin) return;
    
    const selectors = [
      'input[placeholder*="vin" i]',
      'input[aria-label*="vin" i]',
      'input[placeholder*="vehicle identification" i]'
    ];

    await fillInput(selectors, pendingPost.vin);
  }

  async function fillPrice() {
    if (!pendingPost.price) return;
    
    const selectors = [
      'input[placeholder*="price" i]',
      'input[aria-label*="price" i]',
      'input[type="number"]',
      'input[inputmode="numeric"]'
    ];

    const price = pendingPost.price.replace(/[^\d]/g, '');
    await fillInput(selectors, price);
  }

  async function fillTitle() {
    if (!pendingPost.year || !pendingPost.make || !pendingPost.model) return;
    
    const selectors = [
      'input[placeholder*="title" i]',
      'input[aria-label*="title" i]',
      'input[placeholder*="listing title" i]'
    ];

    let title = `${pendingPost.year} ${pendingPost.make} ${pendingPost.model}`;
    if (pendingPost.trim) {
      title += ` ${pendingPost.trim}`;
    }

    // Add emoji if configured
    if (pendingPost.config?.emoji && pendingPost.config.emoji !== 'none') {
      const emojiMap = {
        'sparkle': '✨',
        'fire': '🔥',
        'star': '⭐',
        'checkmark': '✅'
      };
      const emoji = emojiMap[pendingPost.config.emoji];
      if (emoji) {
        title = `${emoji} ${title} ${emoji}`;
      }
    }

    await fillInput(selectors, title);
  }

  async function fillDescription() {
    const description = pendingPost.description || generateBasicDescription();
    
    const selectors = [
      'textarea[placeholder*="description" i]',
      'textarea[aria-label*="description" i]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea'
    ];

    await fillInput(selectors, description);
  }

  async function fillLocation() {
    const selectors = [
      'input[placeholder*="location" i]',
      'input[aria-label*="location" i]',
      'input[placeholder*="address" i]'
    ];

    if (pendingPost.dealerAddress) {
      await fillInput(selectors, pendingPost.dealerAddress);
    }
  }

  async function fillCondition() {
    if (!pendingPost.condition) return;
    
    // Look for condition dropdown/radio buttons
    const condition = pendingPost.condition.toLowerCase();
    const isNew = condition.includes('new');
    
    const conditionElement = findElementByText([
      isNew ? 'New' : 'Used',
      isNew ? 'Brand New' : 'Pre-owned'
    ]);
    
    if (conditionElement) {
      simulateClick(conditionElement);
      await sleep(500);
    }
  }

  async function fillTransmission() {
    if (!pendingPost.transmission) return;
    
    const trans = pendingPost.transmission.toLowerCase();
    const isAutomatic = trans.includes('automatic');
    
    const element = findElementByText([
      isAutomatic ? 'Automatic' : 'Manual',
      trans
    ]);
    
    if (element) {
      simulateClick(element);
      await sleep(500);
    }
  }

  async function fillDrivetrain() {
    if (!pendingPost.drivetrain) return;
    
    const element = findElementByText([
      pendingPost.drivetrain,
      'AWD', 'FWD', 'RWD', '4WD'
    ]);
    
    if (element) {
      simulateClick(element);
      await sleep(500);
    }
  }

  async function fillFuelType() {
    if (!pendingPost.engine) return;
    
    const engine = pendingPost.engine.toLowerCase();
    let fuelType = 'Gasoline';
    
    if (engine.includes('diesel')) fuelType = 'Diesel';
    if (engine.includes('electric')) fuelType = 'Electric';
    if (engine.includes('hybrid')) fuelType = 'Hybrid';
    
    const element = findElementByText([fuelType]);
    if (element) {
      simulateClick(element);
      await sleep(500);
    }
  }

  async function fillExteriorColor() {
    if (!pendingPost.exteriorColor) return;
    
    const colorInput = document.querySelector('input[placeholder*="exterior" i], input[aria-label*="exterior" i]');
    if (colorInput && isVisible(colorInput)) {
      await fillInput([colorInput], pendingPost.exteriorColor);
    }
  }

  async function fillInteriorColor() {
    if (!pendingPost.interiorColor) return;
    
    const colorInput = document.querySelector('input[placeholder*="interior" i], input[aria-label*="interior" i]');
    if (colorInput && isVisible(colorInput)) {
      await fillInput([colorInput], pendingPost.interiorColor);
    }
  }

  // ============ Image Handling ============

  async function handleImages() {
    if (!pendingPost.images || pendingPost.images.length === 0) return;
    
    console.log(`Preparing to upload ${pendingPost.images.length} images`);
    
    // Find file input
    const fileInput = document.querySelector('input[type="file"][accept*="image"]');
    
    if (fileInput) {
      // Download and upload images
      for (let i = 0; i < Math.min(pendingPost.images.length, 24); i++) {
        try {
          const imageUrl = pendingPost.images[i];
          await uploadImage(fileInput, imageUrl, i);
          await sleep(1000); // Wait between uploads
        } catch (error) {
          console.error(`Error uploading image ${i}:`, error);
        }
      }
    }
  }

  async function uploadImage(fileInput, imageUrl, index) {
    try {
      // Fetch the image
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Create a File object
      const file = new File([blob], `vehicle_image_${index}.jpg`, { type: 'image/jpeg' });
      
      // Create a DataTransfer object to set files
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      // Set the files to the input
      fileInput.files = dataTransfer.files;
      
      // Trigger change event
      const event = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(event);
      
      console.log(`Uploaded image ${index + 1}`);
    } catch (error) {
      console.error(`Failed to upload image ${index}:`, error);
    }
  }

  // ============ Helper Functions ============

  async function fillInput(selectors, value) {
    for (const selector of selectors) {
      const element = typeof selector === 'string' 
        ? document.querySelector(selector) 
        : selector;
      
      if (element && isVisible(element)) {
        // Focus the element
        element.focus();
        await sleep(100);
        
        // Set value with human-like typing
        if (element.tagName === 'DIV' && element.contentEditable === 'true') {
          await humanLikeTyping(element, value, true);
        } else {
          await humanLikeTyping(element, value, false);
        }
        
        console.log(`Filled: ${selector} = ${value}`);
        await sleep(300);
        return true;
      }
    }
    return false;
  }

  /**
   * Human-like typing simulation to avoid bot detection
   * @param {HTMLElement} element - Target element
   * @param {string} text - Text to type
   * @param {boolean} isContentEditable - Whether element is contentEditable
   */
  async function humanLikeTyping(element, text, isContentEditable = false) {
    // Clear existing content
    if (isContentEditable) {
      element.textContent = '';
      element.innerHTML = '';
    } else {
      element.value = '';
    }

    // Type character by character with random delays
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (isContentEditable) {
        element.textContent += char;
        element.innerHTML = element.textContent;
      } else {
        element.value += char;
      }

      // Trigger input event for each character
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Random delay between 30-120ms per character (human-like)
      const delay = Math.floor(Math.random() * 90) + 30;
      await sleep(delay);
      
      // Occasionally add longer pauses (thinking time)
      if (Math.random() < 0.1) {
        await sleep(Math.floor(Math.random() * 300) + 100);
      }
    }

    // Final events
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    
    // Random final pause
    await sleep(Math.floor(Math.random() * 200) + 100);
  }

  function simulateClick(element) {
    if (!element) return;
    
    element.focus();
    element.click();
    
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(clickEvent);
  }

  function findElementByText(texts) {
    const allElements = document.querySelectorAll('span, button, label, div[role="button"]');
    
    for (const text of texts) {
      for (const el of allElements) {
        if (el.textContent.trim().toLowerCase() === text.toLowerCase()) {
          return el;
        }
      }
    }
    return null;
  }

  function isVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetParent !== null;
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function generateBasicDescription() {
    let desc = `${pendingPost.year} ${pendingPost.make} ${pendingPost.model}`;
    
    if (pendingPost.trim) {
      desc += ` ${pendingPost.trim}`;
    }
    
    desc += '\n\n';
    
    if (pendingPost.mileage && pendingPost.config?.options?.includeMileage) {
      desc += `📊 Mileage: ${pendingPost.mileage} miles\n`;
    }
    
    if (pendingPost.exteriorColor) {
      desc += `🎨 Exterior Color: ${pendingPost.exteriorColor}\n`;
    }
    
    if (pendingPost.transmission) {
      desc += `⚙️ Transmission: ${pendingPost.transmission}\n`;
    }
    
    if (pendingPost.drivetrain) {
      desc += `🚗 Drivetrain: ${pendingPost.drivetrain}\n`;
    }
    
    if (pendingPost.vin) {
      desc += `\nVIN: ${pendingPost.vin}\n`;
    }
    
    if (pendingPost.dealerName && pendingPost.config?.options?.includeDealerInfo) {
      desc += `\n📍 Available at: ${pendingPost.dealerName}\n`;
      if (pendingPost.dealerPhone) {
        desc += `📞 Contact: ${pendingPost.dealerPhone}\n`;
      }
    }
    
    return desc;
  }

  function sendProgressUpdate(message) {
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      message: message
    });
  }

  // Detect successful post
  function detectPostCompletion() {
    // Look for success indicators
    const successIndicators = [
      'Your listing is live',
      'Successfully posted',
      'Listing created',
      'View your listing'
    ];
    
    for (const text of successIndicators) {
      if (document.body.textContent.includes(text)) {
        // Post was successful - verify by checking selling tab
        verifyPostInSellingTab();
        return true;
      }
    }
    
    return false;
  }

  /**
   * Verify post by checking Facebook Marketplace "Selling" tab
   * Redundant verification to handle "Something went wrong" false positives
   */
  async function verifyPostInSellingTab() {
    try {
      console.log('Verifying post in Selling tab...');
      
      // Navigate to selling tab
      const sellingTabUrl = 'https://www.facebook.com/marketplace/you/selling';
      const currentUrl = window.location.href;
      
      // If not already on selling tab, check it
      if (!currentUrl.includes('you/selling')) {
        // Wait a bit for post to register in Facebook's system
        await sleep(3000);
        
        // Open selling tab in background to verify
        const response = await fetch(sellingTabUrl);
        const html = await response.text();
        
        // Check if VIN or vehicle title appears in selling listings
        if (pendingPost.vin && html.includes(pendingPost.vin)) {
          console.log('✓ Post verified in Selling tab by VIN');
          notifyPostSuccess(true);
          return true;
        }
        
        const vehicleTitle = `${pendingPost.year} ${pendingPost.make} ${pendingPost.model}`;
        if (html.includes(vehicleTitle)) {
          console.log('✓ Post verified in Selling tab by title');
          notifyPostSuccess(true);
          return true;
        }
      }
      
      // If we can't verify, mark as uncertain
      console.warn('⚠ Could not verify post in Selling tab');
      notifyPostSuccess(false, 'Post may have succeeded but could not be verified');
      
    } catch (error) {
      console.error('Error verifying post:', error);
      notifyPostSuccess(false, error.message);
    }
  }

  /**
   * Notify background script of post completion
   * @param {boolean} verified - Whether post was verified
   * @param {string} message - Optional message
   */
  function notifyPostSuccess(verified, message = null) {
    const listingUrl = window.location.href.includes('you/selling') 
      ? 'https://www.facebook.com/marketplace/you/selling'
      : window.location.href;
    
    chrome.runtime.sendMessage({
      action: 'postComplete',
      success: verified,
      vin: pendingPost.vin,
      listingUrl: listingUrl,
      verified: verified,
      message: message,
      vehicleData: pendingPost
    });
    
    // Clear pending post if verified
    if (verified) {
      chrome.storage.local.remove('pendingPost');
      
      if (observer) {
        observer.disconnect();
      }
    }
  }

  // Check for errors
  setInterval(() => {
    detectPostCompletion();
    
    // Check for errors
    const errorTexts = ['Something went wrong', 'Error', 'Try again'];
    for (const text of errorTexts) {
      if (document.body.textContent.includes(text)) {
        console.warn('Detected error message:', text);
        sendProgressUpdate('Error detected. Please check the form.');
      }
    }
  }, 2000);

})();
