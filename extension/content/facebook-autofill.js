// facebook-autofill.js
// Content script that automatically fills Facebook Marketplace vehicle listing forms
// Uses MutationObserver to detect DOM changes and fill fields dynamically

(function () {
  'use strict';

  console.log('Facebook Marketplace Auto-Fill Agent Loaded');

  let pendingPost = null;
  let fillAttempts = 0;
  const MAX_ATTEMPTS = 5; // Reduced attempts to prevent loops
  let observer = null;
  let filledFields = new Set(); // Track which fields have been filled
  let isFilling = false; // Prevent concurrent fill attempts
  let lastFillTime = 0; // Debounce fills

  // Helper function to check if extension context is valid
  function isExtensionContextValid() {
    try {
      return chrome && chrome.runtime && chrome.runtime.id !== undefined;
    } catch (error) {
      return false;
    }
  }
  // Helper function to safely call chrome APIs
  async function safeChromeStorageGet(keys) {
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated, cannot access storage');
      return {};
    }
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during storage access');
        return {};
      }
      throw error;
    }
  }

  function safeChromeStorageRemove(keys) {
    if (!isExtensionContextValid()) return;
    try {
      chrome.storage.local.remove(keys).catch(err => {
        if (!err.message || !err.message.includes('Extension context invalidated')) {
          console.error('Error removing from storage:', err);
        }
      });
    } catch (error) {
      if (!error.message || !error.message.includes('Extension context invalidated')) {
        console.error('Error removing from storage:', error);
      }
    }
  }

  function safeChromeRuntimeSendMessage(message) {
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated, cannot send message');
      return;
    }
    try {
      chrome.runtime.sendMessage(message).catch(err => {
        if (!err.message || !err.message.includes('Extension context invalidated')) {
          console.warn('Error sending message:', err);
        }
      });
    } catch (error) {
      if (!error.message || !error.message.includes('Extension context invalidated')) {
        console.error('Error sending message:', error);
      }
    }
  }

  // Message listener for receiving test data directly (without storage)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Ping handler to check if content script is loaded
    if (request.action === 'ping') {
      sendResponse({ success: true, loaded: true });
      return true;
    }

    if (request.action === 'fillFormWithData') {
      console.log('Received test data via API:', request.data);

      // Set pendingPost directly without storage
      pendingPost = request.data;

      // Reset fill state
      filledFields.clear();
      fillAttempts = 0;
      isFilling = false;

      // Start observer if not already started
      if (!observer) {
        startObserver();
      }

      // Start filling immediately
      setTimeout(() => {
        attemptAutoFill();
      }, 500);

      sendResponse({ success: true, message: 'Test data received, starting form fill' });
      return true; // Keep channel open for async response
    }

    if (request.action === 'uploadSpecificImage') {
      console.log('Received individual image upload request:', request.imageUrl);

      const fileInput = document.querySelector('input[type="file"][accept*="image"]');
      if (!fileInput) {
        sendResponse({ success: false, message: 'File input not found on page' });
        return true;
      }

      uploadImage(fileInput, request.imageUrl, Date.now())
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, message: err.message }));

      return true;
    }

    return false;
  });

  // Initialize the autofill agent
  init();

  async function init() {
    try {
      // Don't load from storage/history - only use data sent via messages
      // This prevents loading old/stale data
      console.log('Autofill agent initialized - waiting for post data via message');

      // Don't start observer yet - wait for data to arrive via message
      // Observer will be started when fillFormWithData message is received
    } catch (error) {
      console.error('Error initializing autofill:', error);
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context was invalidated during initialization');
      }
    }
  }

  function startObserver() {
    // MutationObserver to detect when form elements are loaded
    observer = new MutationObserver((mutations) => {
      // Stop observer if extension context is invalidated
      if (!isExtensionContextValid()) {
        console.log('Extension context invalidated, stopping observer');
        if (observer) {
          observer.disconnect();
        }
        return;
      }

      // Don't trigger if we don't have post data yet
      if (!pendingPost) {
        return;
      }

      // Debounce: Only trigger if last fill was more than 2 seconds ago
      const now = Date.now();
      if (now - lastFillTime < 2000) {
        return;
      }

      // Stop if already filling or max attempts reached
      if (isFilling || fillAttempts >= MAX_ATTEMPTS) {
        if (fillAttempts >= MAX_ATTEMPTS && observer) {
          observer.disconnect();
          console.log('Max fill attempts reached, stopping observer');
        }
        return;
      }

      // Only trigger if we haven't filled all required fields
      // Increased to 15 to allow all fields: category, year, make, model, mileage, vin, price, title, description, location, condition, transmission, fuelType, exteriorColor, interiorColor
      if (filledFields.size < 15) {
        attemptAutoFill();
      } else {
        // All fields filled, disconnect observer
        if (observer) {
          observer.disconnect();
          console.log('All fields filled, stopping observer');
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Start error check when observer starts
    startErrorCheck();
  }

  async function attemptAutoFill() {
    // Stop if extension context is invalidated
    if (!isExtensionContextValid()) {
      console.log('Extension context invalidated, stopping autofill');
      return;
    }

    // Check if we have post data - if not, don't attempt to fill
    if (!pendingPost) {
      console.log('No pending post data available, skipping autofill');
      return;
    }

    // Prevent concurrent fills
    if (isFilling) {
      return;
    }

    isFilling = true;
    fillAttempts++;
    lastFillTime = Date.now();
    console.log(`Auto-fill attempt ${fillAttempts}/${MAX_ATTEMPTS}`);

    // Check if we're on the vehicle listing page
    if (!window.location.href.includes('marketplace/create')) {
      isFilling = false;
      return;
    }

    // Store pendingPost reference to prevent it from becoming null during execution
    const postData = pendingPost;
    if (!postData) {
      console.log('pendingPost is null, cannot proceed');
      isFilling = false;
      return;
    }

    try {
      // Wait for form to be ready - give more time for Facebook's dynamic content to load
      try {
        await waitForElement('[role="dialog"], form, [data-pagelet]', 10000);
      } catch (error) {
        console.log('Form container not found with standard selectors, trying alternative...');
        // Try alternative selectors
        const altSelectors = [
          'form',
          '[role="dialog"]',
          '[data-pagelet]',
          'div[role="main"]',
          'div[data-testid]'
        ];

        let formFound = false;
        for (const selector of altSelectors) {
          try {
            await waitForElement(selector, 3000);
            formFound = true;
            console.log(`Found form container with selector: ${selector}`);
            break;
          } catch (e) {
            // Continue to next selector
          }
        }

        if (!formFound) {
          console.log('Form container not found, but continuing anyway...');
          // Continue anyway - the form might be loaded but with different structure
        }
      }

      // Fill different form sections based on what's visible (only if not already filled)
      // Use postData (local copy) instead of pendingPost to prevent null reference errors
      if (!filledFields.has('category')) {
        const categoryFilled = await fillVehicleCategory();
        if (categoryFilled) filledFields.add('category');
      }

      // Use postData instead of pendingPost to prevent null reference
      if (!filledFields.has('year') && postData?.year) {
        const yearFilled = await fillYear();
        if (yearFilled) filledFields.add('year');
      }

      if (!filledFields.has('make') && postData?.make) {
        const makeFilled = await fillMake();
        if (makeFilled) filledFields.add('make');
      }

      if (!filledFields.has('model') && postData?.model) {
        const modelFilled = await fillModel();
        if (modelFilled) filledFields.add('model');
      }

      if (!filledFields.has('mileage') && postData?.mileage) {
        const mileageFilled = await fillMileage();
        if (mileageFilled) filledFields.add('mileage');
      }

      if (!filledFields.has('vin') && postData?.vin) {
        const vinFilled = await fillVIN();
        if (vinFilled) filledFields.add('vin');
      }

      if (!filledFields.has('price') && postData?.price) {
        const priceFilled = await fillPrice();
        if (priceFilled) filledFields.add('price');
      }

      if (!filledFields.has('title') && postData?.year && postData?.make && postData?.model) {
        const titleFilled = await fillTitle();
        if (titleFilled) filledFields.add('title');
      }

      // Description should only be filled once with the actual description
      if (!filledFields.has('description') && postData) {
        const descFilled = await fillDescription();
        if (descFilled) filledFields.add('description');
        // Scroll down after description to load more form fields
        window.scrollBy(0, 300);
        await sleep(800);
      }

      if (!filledFields.has('location') && postData?.dealerAddress) {
        console.log('Attempting to fill location...');
        const locationFilled = await fillLocation();
        if (locationFilled) {
          filledFields.add('location');
          console.log('✅ Location filled successfully');
        } else {
          console.log('⚠️ Location failed or not available');
        }
        await sleep(500);
      }

      if (!filledFields.has('condition') && postData?.condition) {
        console.log('Attempting to fill condition...');
        window.scrollBy(0, 200);
        await sleep(500);
        const conditionFilled = await fillCondition();
        if (conditionFilled) {
          filledFields.add('condition');
          console.log('✅ Condition filled successfully');
        } else {
          console.log('⚠️ Condition failed or not available');
        }
        await sleep(500);
      }

      if (!filledFields.has('transmission') && postData?.transmission) {
        const transmissionFilled = await fillTransmission();
        if (transmissionFilled) filledFields.add('transmission');
      }

      if (!filledFields.has('drivetrain') && postData?.drivetrain) {
        const drivetrainFilled = await fillDrivetrain();
        if (drivetrainFilled) filledFields.add('drivetrain');
      }

      // Check both fuelType and engine fields
      if (!filledFields.has('fuelType') && (postData?.fuelType || postData?.engine)) {
        console.log('Attempting to fill fuel type...');
        window.scrollBy(0, 200);
        await sleep(500);
        const fuelFilled = await fillFuelType();
        if (fuelFilled) {
          filledFields.add('fuelType');
          console.log('✅ Fuel type filled successfully');
        } else {
          console.log('⚠️ Fuel type failed or not available');
        }
        await sleep(500);
      }

      if (!filledFields.has('exteriorColor') && postData?.exteriorColor) {
        console.log('Attempting to fill exterior color...');
        window.scrollBy(0, 200);
        await sleep(500);
        const extColorFilled = await fillExteriorColor();
        if (extColorFilled) {
          filledFields.add('exteriorColor');
          console.log('✅ Exterior color filled successfully');
        } else {
          console.log('⚠️ Exterior color failed or not available');
        }
        await sleep(500);
      }

      if (!filledFields.has('interiorColor') && postData?.interiorColor) {
        console.log('Attempting to fill interior color...');
        const intColorFilled = await fillInteriorColor();
        if (intColorFilled) {
          filledFields.add('interiorColor');
          console.log('✅ Interior color filled successfully');
        } else {
          console.log('⚠️ Interior color failed or not available');
        }
        await sleep(500);
      }

      if (!filledFields.has('bodyStyle') && postData?.bodyStyle) {
        console.log('Attempting to fill body style...');
        const bodyStyleFilled = await fillBodyStyle();
        if (bodyStyleFilled) {
          filledFields.add('bodyStyle');
          console.log('✅ Body style filled successfully');
        } else {
          console.log('⚠️ Body style failed or not available');
        }
        await sleep(500);
      }

      // Fill Checkboxes (Clean Title, No Damage)
      if (!filledFields.has('checkboxes')) {
        console.log('Attempting to fill checkboxes...');
        await fillCleanTitle();
        await fillNoDamage();
        filledFields.add('checkboxes');
        await sleep(500);
      }

      /* 
      // Handle images (only once)
      if (!filledFields.has('images') && postData?.images && postData.images.length > 0) {
        await handleImages();
        filledFields.add('images');
      }
      */

      // Notify user of progress
      sendProgressUpdate('Auto-fill complete! Please verify details.');

      // Start monitoring for the "Publish" button click
      monitorPublishButton(postData);

    } catch (error) {
      console.error('Auto-fill error:', error);
    } finally {
      isFilling = false;
    }
  }

  // Monitor for Publish/Next button clicks
  // Monitor for Publish/Next button clicks
  let isMonitorAttached = false; // Flag to prevent multiple listeners

  function monitorPublishButton(vehicleData) {
    if (isMonitorAttached) {
      console.log('Publish monitor already attached, skipping...');
      return;
    }

    console.log('Starting publish button monitor...');
    isMonitorAttached = true;

    // Named function so we can remove it
    const clickListener = function (e) {
      const target = e.target;

      // Look for buttons with specific text
      const button = target.closest('[role="button"], button');

      if (button) {
        const text = (button.innerText || button.textContent || '').toLowerCase().trim();
        // console.log('Button clicked:', text); // Reduce spam

        // Check if this is likely the final publish action
        if (text === 'publish' || text === 'post' || text.includes('publish')) {
          console.log('Publish action detected!');

          // Remove listener immediately to prevent duplicates
          document.removeEventListener('click', clickListener, true);
          isMonitorAttached = false;

          // Send confirmation to background
          safeChromeRuntimeSendMessage({
            action: 'postActionConfirmed',
            vehicleId: vehicleData._id,
            platform: 'facebook_marketplace',
            listingUrl: window.location.href // Initial URL, might change later
          });
        }
      }
    };

    // Use capture phase to catch it before propagation stops
    document.addEventListener('click', clickListener, true);
  }

  // ============ Field Filling Functions ============

  // ========== HELPERS ==========
  const VEHICLE_TYPE_INDEX = {
    "Car/van": 0,
    "Motorcycle": 1,
    "Power sport": 2,
    "Motorhome/caravan": 3,
    "Trailer": 4,
    "Boat": 5,
    "Commercial/Industrial": 6,
    "Other": 7
  };

  const EXTERIOR_COLOR_INDEX = {
    "Black": 0,
    "Blue": 1,
    "Brown": 2,
    "Gold": 3,
    "Green": 4,
    "Grey": 5,
    "Pink": 6,
    "Purple": 7,
    "Red": 8,
    "Silver": 9,
    "Orange": 10,
    "White": 11,
    "Yellow": 12,
    "Charcoal": 13,
    "Off white": 14,
    "Tan": 15,
    "Beige": 16,
    "Burgundy": 17,
    "Turquoise": 18
  };

  const INTERIOR_COLOR_INDEX = {
    "Black": 0,
    "Blue": 1,
    "Brown": 2,
    "Gold": 3,
    "Green": 4,
    "Grey": 5,
    "Pink": 6,
    "Purple": 7,
    "Red": 8,
    "Silver": 9,
    "Orange": 10,
    "White": 11,
    "Yellow": 12,
    "Charcoal": 13,
    "Off white": 14,
    "Tan": 15,
    "Beige": 16,
    "Burgundy": 17,
    "Turquoise": 18
  };

  const FUEL_TYPE_INDEX = {
    "Diesel": 0,
    "Electric": 1,
    "Petrol": 2,
    "Flex": 3,
    "Hybrid": 4,
    "Plug-in hybrid": 5,
    "Other": 6
  };

  const CONDITION_INDEX = {
    "Excellent": 0,
    "Very good": 1,
    "Good": 2,
    "Fair": 3,
    "Poor": 4
  };

  const BODY_STYLE_INDEX = {
    "Coupé": 0,
    "Van": 1,
    "Saloon": 2,
    "Hatchback": 3,
    "4x4": 4,
    "Convertible": 5,
    "Estate": 6,
    "MPV/People carrier": 7,
    "Small car": 8,
    "Other": 9
  };

  const TRANSMISSION_INDEX = {
    "Manual transmission": 0,
    "Automatic transmission": 1
  };

  function openDropdown(dropdown) {
    dropdown.scrollIntoView({ block: "center" });
    dropdown.focus();

    dropdown.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    dropdown.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    dropdown.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    dropdown.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true
      })
    );
  }


  function waitForExpanded(dropdown, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const expanded = dropdown.getAttribute("aria-expanded") === "true";
        const listbox = document.querySelector('[role="listbox"]');

        if (expanded && listbox) {
          clearInterval(timer);
          resolve();
        }

        if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject("Dropdown did not open");
        }
      }, 50);
    });
  }

  function waitForOptions(timeout = 3000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const listbox = document.querySelector('[role="listbox"]');
        const options = listbox?.querySelectorAll('[role="option"]');

        if (options && options.length > 0) {
          clearInterval(timer);
          resolve([...options]);
        }

        if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(new Error("Options not found within timeout"));
        }
      }, 50);
    });
  }

  function fbSelectOption(option) {
    option.scrollIntoView({ block: "center" });
    option.focus();

    option.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    option.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    option.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    option.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    option.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true
      })
    );
  }

  async function selectVehicleByIndex(index) {
    const dropdown = document.querySelector(
      'label[role="combobox"][aria-haspopup="listbox"]'
    );

    if (!dropdown) {
      console.error('Vehicle type dropdown not found');
      return false;
    }

    // Reset state if dropdown is already open
    if (dropdown.getAttribute("aria-expanded") === "true") {
      dropdown.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true
        })
      );
      await sleep(200);
    }

    // Open dropdown
    openDropdown(dropdown);

    // Wait for dropdown to expand
    try {
      await waitForExpanded(dropdown);
    } catch (error) {
      console.error('Error opening dropdown:', error);
      return false;
    }

    // Wait for options to appear
    let options;
    try {
      options = await waitForOptions();
      console.log(`Found ${options.length} options`);
    } catch (error) {
      console.error('Error waiting for options:', error);
      return false;
    }

    // Select option by index
    const target = options[index];
    if (!target) {
      console.error(`Option at index ${index} not found. Available indices: 0-${options.length - 1}`);
      return false;
    }

    console.log(`Selecting option at index ${index}: "${target.innerText || target.textContent}"`);
    fbSelectOption(target);

    await sleep(1000);

    // Verify selection
    const isClosed = dropdown.getAttribute('aria-expanded') === 'false';
    const selectedText = dropdown.textContent || '';

    if (isClosed && selectedText !== 'Vehicle type') {
      console.log(`✅ Successfully selected: "${selectedText}"`);
      return true;
    } else {
      console.log(`⚠ Selection may not have worked. Closed: ${isClosed}, Text: "${selectedText}"`);
      return isClosed;
    }
  }

  /**
   * Select vehicle type by name using the VEHICLE_TYPE_INDEX mapping
   * @param {string} vehicleType - The vehicle type name (e.g., 'Car/van', 'Boat', 'Motorcycle')
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectVehicleType(vehicleType = 'Car/van') {
    // First try exact match
    let index = VEHICLE_TYPE_INDEX[vehicleType];

    // If not found, try case-insensitive match
    if (index === undefined) {
      const vehicleTypeLower = vehicleType.toLowerCase();
      const matchedKey = Object.keys(VEHICLE_TYPE_INDEX).find(
        key => key.toLowerCase() === vehicleTypeLower
      );

      if (matchedKey) {
        index = VEHICLE_TYPE_INDEX[matchedKey];
        vehicleType = matchedKey; // Use the correct casing
        console.log(`ℹ️ Case-insensitive match: "${vehicleType}"`);
      }
    }

    if (index === undefined) {
      console.error(`❌ Unknown vehicle type: "${vehicleType}". Available types:`, Object.keys(VEHICLE_TYPE_INDEX));
      return false;
    }

    console.log(`🚗 Selecting vehicle type: "${vehicleType}" (index: ${index})`);
    return await selectVehicleByIndex(index);
  }

  async function fillVehicleCategory() {
    // Get local copy to prevent null reference
    const postData = pendingPost;
    if (!postData) return false;

    console.log('=== Starting fillVehicleCategory ===');

    // Get vehicle type from postData config if available, otherwise default to Car/van
    let targetVehicleType = 'Car/van';

    if (postData?.config?.category) {
      const category = postData.config.category;
      console.log(`📋 Received category from config: "${category}"`);

      // First, check if the category directly matches a VEHICLE_TYPE_INDEX key (case-insensitive)
      const categoryLower = category.toLowerCase();
      const vehicleTypeKeys = Object.keys(VEHICLE_TYPE_INDEX);
      const directMatch = vehicleTypeKeys.find(key => key.toLowerCase() === categoryLower);

      if (directMatch) {
        targetVehicleType = directMatch;
        console.log(`✓ Direct match found: "${targetVehicleType}"`);
      } else {
        // Use categoryMap for backward compatibility with lowercase values
        const categoryMap = {
          'car': 'Car/van',
          'truck': 'Car/van',
          'suv': 'Car/van',
          'van': 'Car/van',
          'motorcycle': 'Motorcycle',
          'boat': 'Boat',
          'other': 'Other'
        };
        targetVehicleType = categoryMap[categoryLower] || 'Car/van';
        console.log(`✓ Mapped via categoryMap: "${category}" → "${targetVehicleType}"`);
      }
    } else {
      console.log('⚠ No category in config, defaulting to Car/van');
    }

    console.log(`🎯 Target vehicle type: "${targetVehicleType}"`);

    // Use selectVehicleType which uses the index mapping
    return await selectVehicleType(targetVehicleType);
  }



  /**
   * Select year by index from dropdown (similar to vehicle type selection)
   * @param {number} index - The index of the year option (0 = current year, 1 = current year - 1, etc.)
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectYearByIndex(index) {
    // Find year dropdown - look for label with "Year" text that has combobox role
    let dropdown = null;

    // Strategy 1: Find label with "Year" text that has combobox role
    const allLabels = document.querySelectorAll('label');
    for (const label of allLabels) {
      const labelText = label.textContent || '';
      if (labelText.toLowerCase().includes('year') &&
        label.getAttribute('role') === 'combobox' &&
        label.getAttribute('aria-haspopup') === 'listbox') {
        dropdown = label;
        break;
      }
    }

    // Strategy 2: Find by span with "Year" text and look for nearby combobox
    if (!dropdown) {
      const yearSpans = Array.from(document.querySelectorAll('span')).filter(span => {
        const text = span.textContent || '';
        return text.toLowerCase().trim() === 'year';
      });

      for (const span of yearSpans) {
        const parent = span.closest('label, div');
        if (parent) {
          const combobox = parent.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
          if (combobox) {
            dropdown = combobox;
            break;
          }
        }
      }
    }

    // Strategy 3: Generic combobox near year-related elements
    if (!dropdown) {
      dropdown = document.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
    }

    if (!dropdown) {
      console.error('Year dropdown not found');
      return false;
    }

    // Reset state if dropdown is already open
    if (dropdown.getAttribute("aria-expanded") === "true") {
      dropdown.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true
        })
      );
      await sleep(200);
    }

    // Open dropdown
    openDropdown(dropdown);

    // Wait for dropdown to expand
    try {
      await waitForExpanded(dropdown);
    } catch (error) {
      console.error('Error opening year dropdown:', error);
      return false;
    }

    // Wait for options to appear
    let options;
    try {
      options = await waitForOptions();
      console.log(`Found ${options.length} year options`);
    } catch (error) {
      console.error('Error waiting for year options:', error);
      return false;
    }

    // Select option by index
    const target = options[index];
    if (!target) {
      console.error(`Year option at index ${index} not found. Available indices: 0-${options.length - 1}`);
      return false;
    }

    console.log(`Selecting year at index ${index}: "${target.innerText || target.textContent}"`);
    fbSelectOption(target);

    await sleep(1000);

    // Verify selection
    const isClosed = dropdown.getAttribute('aria-expanded') === 'false';
    const selectedText = dropdown.textContent || '';

    if (isClosed && selectedText !== 'Year' && selectedText.trim() !== '') {
      console.log(`✅ Successfully selected year: "${selectedText}"`);
      return true;
    } else {
      console.log(`⚠ Year selection may not have worked. Closed: ${isClosed}, Text: "${selectedText}"`);
      return isClosed;
    }
  }

  /**
   * Select year by year value (calculates index from current year)
   * Facebook includes 1 upcoming year, so the dropdown structure is:
   * Index 0 = currentYear + 1 (upcoming year)
   * Index 1 = currentYear
   * Index 2 = currentYear - 1
   * Index 3 = currentYear - 2
   * ... down to 1930
   * @param {string|number} year - The year to select (e.g., '2023' or 2023)
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectYear(year) {
    const currentYear = new Date().getFullYear();
    const upcomingYear = currentYear + 1;
    const yearNum = parseInt(year);

    if (isNaN(yearNum) || yearNum < 1930 || yearNum > upcomingYear) {
      console.error(`❌ Invalid year: ${year}. Must be between 1930 and ${upcomingYear}`);
      return false;
    }

    // Calculate index: 0 = upcoming year, 1 = current year, 2 = current year - 1, etc.
    const index = upcomingYear - yearNum;

    console.log(`📅 Selecting year: ${yearNum} (index: ${index}, upcoming year: ${upcomingYear})`);
    return await selectYearByIndex(index);
  }

  async function fillYear() {
    // Get local copy to prevent null reference
    const postData = pendingPost;
    if (!postData || !postData.year) return false;

    console.log('=== Starting fillYear ===');

    // Try index-based selection first (dropdown approach)
    const yearSelected = await selectYear(postData.year);

    if (yearSelected) {
      return true;
    }

    // Fallback to direct input if dropdown selection fails
    console.log('Dropdown selection failed, trying direct input...');
    const selectors = [
      'input[placeholder*="year" i]',
      'input[aria-label*="year" i]',
      'input[name*="year" i]'
    ];

    return await fillInput(selectors, postData.year);
  }

  /**
   * Select exterior color by index from dropdown (similar to vehicle type and year selection)
   * @param {number} index - The index of the color option
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectExteriorColorByIndex(index) {
    // Find exterior color dropdown - look for div with "Exterior colour" text
    let dropdown = null;

    // Strategy 1: Find span with "Exterior colour" text and look for nearby combobox/dropdown
    const exteriorColorSpans = Array.from(document.querySelectorAll('span')).filter(span => {
      const text = span.textContent || '';
      return text.toLowerCase().includes('exterior') && text.toLowerCase().includes('colour');
    });

    for (const span of exteriorColorSpans) {
      // Look for parent div that contains the dropdown
      const parent = span.closest('div');
      if (parent) {
        // First, look for label with combobox role (most common)
        const labelCombobox = parent.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
        if (labelCombobox) {
          dropdown = labelCombobox;
          break;
        }

        // Look for div with combobox role
        const divCombobox = parent.querySelector('div[role="combobox"][aria-haspopup="listbox"]');
        if (divCombobox) {
          dropdown = divCombobox;
          break;
        }

        // Look for div with tabindex="-1" (clickable dropdown trigger)
        const clickableDiv = parent.querySelector('div[tabindex="-1"]');
        if (clickableDiv) {
          // Check if this div or its parent has combobox role
          const comboboxParent = clickableDiv.closest('[role="combobox"]');
          if (comboboxParent) {
            dropdown = comboboxParent;
          } else {
            dropdown = clickableDiv;
          }
          break;
        }

        // Check for div with role="combobox" as sibling or child
        const comboboxSibling = parent.querySelector('div[role="combobox"]');
        if (comboboxSibling) {
          dropdown = comboboxSibling;
          break;
        }
      }
    }

    // Strategy 2: Find by label with "Exterior colour" text
    if (!dropdown) {
      const allLabels = document.querySelectorAll('label');
      for (const label of allLabels) {
        const labelText = label.textContent || '';
        if (labelText.toLowerCase().includes('exterior') && labelText.toLowerCase().includes('colour')) {
          // Check if label itself is combobox
          if (label.getAttribute('role') === 'combobox') {
            dropdown = label;
            break;
          }
          // Look for combobox within label
          const combobox = label.querySelector('div[role="combobox"], label[role="combobox"]');
          if (combobox) {
            dropdown = combobox;
            break;
          }
          // Look for clickable div within label
          const clickableDiv = label.querySelector('div[tabindex="-1"]');
          if (clickableDiv) {
            dropdown = clickableDiv;
            break;
          }
          // Check parent
          const parentCombobox = label.closest('div[role="combobox"]');
          if (parentCombobox) {
            dropdown = parentCombobox;
            break;
          }
        }
      }
    }

    // Strategy 3: Generic combobox near exterior color elements
    if (!dropdown) {
      const allComboboxes = document.querySelectorAll('label[role="combobox"][aria-haspopup="listbox"], div[role="combobox"][aria-haspopup="listbox"]');
      for (const cb of allComboboxes) {
        const parent = cb.closest('div');
        if (parent) {
          const text = parent.textContent || '';
          if (text.toLowerCase().includes('exterior') && text.toLowerCase().includes('colour')) {
            dropdown = cb;
            break;
          }
        }
      }
    }

    if (!dropdown) {
      console.error('Exterior color dropdown not found');
      return false;
    }

    // Reset state if dropdown is already open
    if (dropdown.getAttribute("aria-expanded") === "true") {
      dropdown.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true
        })
      );
      await sleep(200);
    }

    // Open dropdown - handle both label and div elements
    console.log(`Opening exterior color dropdown, tag: ${dropdown.tagName}, role: ${dropdown.getAttribute('role')}, tabindex: ${dropdown.getAttribute('tabindex')}`);

    if (dropdown.tagName === 'DIV' && dropdown.getAttribute('tabindex') === '-1') {
      // For div dropdowns, click directly with proper events
      dropdown.scrollIntoView({ block: "center" });
      dropdown.focus();
      await sleep(100);

      // Trigger mouse events
      dropdown.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

      // Also try native click
      dropdown.click();

      // Trigger keyboard event
      dropdown.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true
      }));
    } else {
      // For label dropdowns, use standard openDropdown
      openDropdown(dropdown);
    }

    // Wait for dropdown to expand - check both the dropdown and any parent with aria-expanded
    try {
      await waitForExpanded(dropdown);
    } catch (error) {
      console.error('Error opening exterior color dropdown:', error);
      // Try waiting a bit more and checking again
      await sleep(500);
      const expanded = dropdown.getAttribute("aria-expanded") === "true";
      const listbox = document.querySelector('[role="listbox"]');
      if (!expanded && !listbox) {
        console.error('Dropdown did not open after retry');
        return false;
      }
    }

    // Wait for options to appear
    let options;
    try {
      options = await waitForOptions();
      console.log(`Found ${options.length} exterior color options`);
    } catch (error) {
      console.error('Error waiting for exterior color options:', error);
      return false;
    }

    // Select option by index
    const target = options[index];
    if (!target) {
      console.error(`Exterior color option at index ${index} not found. Available indices: 0-${options.length - 1}`);
      return false;
    }

    console.log(`Selecting exterior color at index ${index}: "${target.innerText || target.textContent}"`);
    fbSelectOption(target);

    await sleep(1000);

    // Verify selection
    const isClosed = dropdown.getAttribute('aria-expanded') === 'false';
    const selectedText = dropdown.textContent || '';

    if (isClosed && selectedText !== 'Exterior colour' && selectedText.trim() !== '') {
      console.log(`✅ Successfully selected exterior color: "${selectedText}"`);
      return true;
    } else {
      console.log(`⚠ Exterior color selection may not have worked. Closed: ${isClosed}, Text: "${selectedText}"`);
      return isClosed;
    }
  }

  /**
   * Select exterior color by color name using the EXTERIOR_COLOR_INDEX mapping
   * @param {string} colorName - The color name (e.g., 'Black', 'Blue', 'Red')
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectExteriorColor(colorName) {
    // First try exact match
    let index = EXTERIOR_COLOR_INDEX[colorName];

    // If not found, try case-insensitive match
    if (index === undefined) {
      const colorLower = colorName.toLowerCase();
      const matchedKey = Object.keys(EXTERIOR_COLOR_INDEX).find(
        key => key.toLowerCase() === colorLower
      );

      if (matchedKey) {
        index = EXTERIOR_COLOR_INDEX[matchedKey];
        colorName = matchedKey; // Use the correct casing
        console.log(`ℹ️ Case-insensitive match: "${colorName}"`);
      }
    }

    // Try common color name variations
    if (index === undefined) {
      const colorVariations = {
        'gray': 'Grey',
        'gray': 'Grey',
        'off-white': 'Off white',
        'offwhite': 'Off white',
        'navy': 'Blue',
        'maroon': 'Burgundy',
        'teal': 'Turquoise'
      };

      const colorLower = colorName.toLowerCase();
      if (colorVariations[colorLower]) {
        const matchedColor = colorVariations[colorLower];
        index = EXTERIOR_COLOR_INDEX[matchedColor];
        colorName = matchedColor;
        console.log(`ℹ️ Color variation matched: "${colorName}"`);
      }
    }

    if (index === undefined) {
      console.error(`❌ Unknown exterior color: "${colorName}". Available colors:`, Object.keys(EXTERIOR_COLOR_INDEX));
      return false;
    }

    console.log(`🎨 Selecting exterior color: "${colorName}" (index: ${index})`);
    return await selectExteriorColorByIndex(index);
  }

  /**
   * Select interior color by index from dropdown (similar to exterior color selection)
   * @param {number} index - The index of the color option
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectInteriorColorByIndex(index) {
    // Find interior color dropdown - look for div with "Interior colour" text
    let dropdown = null;

    // Strategy 1: Find span with "Interior colour" text and look for nearby combobox/dropdown
    const interiorColorSpans = Array.from(document.querySelectorAll('span')).filter(span => {
      const text = span.textContent || '';
      return text.toLowerCase().includes('interior') && text.toLowerCase().includes('colour');
    });

    for (const span of interiorColorSpans) {
      // Look for parent div that contains the dropdown
      const parent = span.closest('div');
      if (parent) {
        // First, look for label with combobox role (most common)
        const labelCombobox = parent.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
        if (labelCombobox) {
          dropdown = labelCombobox;
          break;
        }

        // Look for div with combobox role
        const divCombobox = parent.querySelector('div[role="combobox"][aria-haspopup="listbox"]');
        if (divCombobox) {
          dropdown = divCombobox;
          break;
        }

        // Look for div with tabindex="-1" (clickable dropdown trigger)
        const clickableDiv = parent.querySelector('div[tabindex="-1"]');
        if (clickableDiv) {
          // Check if this div or its parent has combobox role
          const comboboxParent = clickableDiv.closest('[role="combobox"]');
          if (comboboxParent) {
            dropdown = comboboxParent;
          } else {
            dropdown = clickableDiv;
          }
          break;
        }

        // Check for div with role="combobox" as sibling or child
        const comboboxSibling = parent.querySelector('div[role="combobox"]');
        if (comboboxSibling) {
          dropdown = comboboxSibling;
          break;
        }
      }
    }

    // Strategy 2: Find by label with "Interior colour" text
    if (!dropdown) {
      const allLabels = document.querySelectorAll('label');
      for (const label of allLabels) {
        const labelText = label.textContent || '';
        if (labelText.toLowerCase().includes('interior') && labelText.toLowerCase().includes('colour')) {
          // Check if label itself is combobox
          if (label.getAttribute('role') === 'combobox') {
            dropdown = label;
            break;
          }
          // Look for combobox within label
          const combobox = label.querySelector('div[role="combobox"], label[role="combobox"]');
          if (combobox) {
            dropdown = combobox;
            break;
          }
          // Look for clickable div within label
          const clickableDiv = label.querySelector('div[tabindex="-1"]');
          if (clickableDiv) {
            dropdown = clickableDiv;
            break;
          }
          // Check parent
          const parentCombobox = label.closest('div[role="combobox"]');
          if (parentCombobox) {
            dropdown = parentCombobox;
            break;
          }
        }
      }
    }

    // Strategy 3: Generic combobox near interior color elements
    if (!dropdown) {
      const allComboboxes = document.querySelectorAll('label[role="combobox"][aria-haspopup="listbox"], div[role="combobox"][aria-haspopup="listbox"]');
      for (const cb of allComboboxes) {
        const parent = cb.closest('div');
        if (parent) {
          const text = parent.textContent || '';
          if (text.toLowerCase().includes('interior') && text.toLowerCase().includes('colour')) {
            dropdown = cb;
            break;
          }
        }
      }
    }

    if (!dropdown) {
      console.error('Interior color dropdown not found');
      return false;
    }

    // Reset state if dropdown is already open
    if (dropdown.getAttribute("aria-expanded") === "true") {
      dropdown.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true
        })
      );
      await sleep(200);
    }

    // Open dropdown - handle both label and div elements
    console.log(`Opening interior color dropdown, tag: ${dropdown.tagName}, role: ${dropdown.getAttribute('role')}, tabindex: ${dropdown.getAttribute('tabindex')}`);

    if (dropdown.tagName === 'DIV' && dropdown.getAttribute('tabindex') === '-1') {
      // For div dropdowns, click directly with proper events
      dropdown.scrollIntoView({ block: "center" });
      dropdown.focus();
      await sleep(100);

      // Trigger mouse events
      dropdown.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

      // Also try native click
      dropdown.click();

      // Trigger keyboard event
      dropdown.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true
      }));
    } else {
      // For label dropdowns, use standard openDropdown
      openDropdown(dropdown);
    }

    // Wait for dropdown to expand - check both the dropdown and any parent with aria-expanded
    try {
      await waitForExpanded(dropdown);
    } catch (error) {
      console.error('Error opening interior color dropdown:', error);
      // Try waiting a bit more and checking again
      await sleep(500);
      const expanded = dropdown.getAttribute("aria-expanded") === "true";
      const listbox = document.querySelector('[role="listbox"]');
      if (!expanded && !listbox) {
        console.error('Dropdown did not open after retry');
        return false;
      }
    }

    // Wait for options to appear
    let options;
    try {
      options = await waitForOptions();
      console.log(`Found ${options.length} interior color options`);
    } catch (error) {
      console.error('Error waiting for interior color options:', error);
      return false;
    }

    // Select option by index
    const target = options[index];
    if (!target) {
      console.error(`Interior color option at index ${index} not found. Available indices: 0-${options.length - 1}`);
      return false;
    }

    console.log(`Selecting interior color at index ${index}: "${target.innerText || target.textContent}"`);
    fbSelectOption(target);

    await sleep(1000);

    // Verify selection
    const isClosed = dropdown.getAttribute('aria-expanded') === 'false';
    const selectedText = dropdown.textContent || '';

    if (isClosed && selectedText !== 'Interior colour' && selectedText.trim() !== '') {
      console.log(`✅ Successfully selected interior color: "${selectedText}"`);
      return true;
    } else {
      console.log(`⚠ Interior color selection may not have worked. Closed: ${isClosed}, Text: "${selectedText}"`);
      return isClosed;
    }
  }

  /**
   * Select interior color by color name using the INTERIOR_COLOR_INDEX mapping
   * @param {string} colorName - The color name (e.g., 'Black', 'Blue', 'Red')
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectInteriorColor(colorName) {
    // First try exact match
    let index = INTERIOR_COLOR_INDEX[colorName];

    // If not found, try case-insensitive match
    if (index === undefined) {
      const colorLower = colorName.toLowerCase();
      const matchedKey = Object.keys(INTERIOR_COLOR_INDEX).find(
        key => key.toLowerCase() === colorLower
      );

      if (matchedKey) {
        index = INTERIOR_COLOR_INDEX[matchedKey];
        colorName = matchedKey; // Use the correct casing
        console.log(`ℹ️ Case-insensitive match: "${colorName}"`);
      }
    }

    // Try common color name variations
    if (index === undefined) {
      const colorVariations = {
        'gray': 'Grey',
        'gray': 'Grey',
        'off-white': 'Off white',
        'offwhite': 'Off white',
        'navy': 'Blue',
        'maroon': 'Burgundy',
        'teal': 'Turquoise'
      };

      const colorLower = colorName.toLowerCase();
      if (colorVariations[colorLower]) {
        const matchedColor = colorVariations[colorLower];
        index = INTERIOR_COLOR_INDEX[matchedColor];
        colorName = matchedColor;
        console.log(`ℹ️ Color variation matched: "${colorName}"`);
      }
    }

    if (index === undefined) {
      console.error(`❌ Unknown interior color: "${colorName}". Available colors:`, Object.keys(INTERIOR_COLOR_INDEX));
      return false;
    }

    console.log(`🎨 Selecting interior color: "${colorName}" (index: ${index})`);
    return await selectInteriorColorByIndex(index);
  }

  async function fillMake() {
    // Get local copy to prevent null reference
    const postData = pendingPost;
    if (!postData || !postData.make) return false;

    console.log('=== Starting fillMake ===');

    // Strategy: Find generic "Make" input and simulate typing to trigger dropdown
    const selectors = [
      'input[placeholder*="make" i]',
      'input[aria-label*="make" i]',
      'input[placeholder*="brand" i]'
    ];

    // Find input
    let makeInput = null;
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) {
        makeInput = el;
        break;
      }
    }

    // Fallback: Label search
    if (!makeInput) {
      const allLabels = document.querySelectorAll('label');
      for (const label of allLabels) {
        const labelText = label.textContent || '';
        if (labelText.toLowerCase().includes('make') && !labelText.toLowerCase().includes('model')) {
          const input = label.querySelector('input[type="text"], input:not([type="file"])');
          if (input && isVisible(input)) {
            makeInput = input;
            break;
          }
        }
      }
    }

    if (!makeInput) {
      console.log('Make input not found');
      return false;
    }

    // Process logic similar to Location - Type and Wait for Autocomplete

    // Click first to ensure active state
    makeInput.click();
    await sleep(200);
    makeInput.focus();
    await sleep(300);

    makeInput.value = '';
    makeInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);

    const makeValue = postData.make;
    console.log(`Typing Make: "${makeValue}"`);

    for (let i = 0; i < makeValue.length; i++) {
      makeInput.value += makeValue[i];
      makeInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(80 + Math.random() * 40);
    }

    // Trigger autocomplete
    makeInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(1500); // Wait longer for results

    makeInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      bubbles: true
    }));
    await sleep(500);

    // Try to select first option
    try {
      // Look for listbox options
      const allListboxes = document.querySelectorAll('[role="listbox"]');
      let options = [];
      for (const listbox of allListboxes) {
        if (isVisible(listbox)) {
          const opts = listbox.querySelectorAll('[role="option"]');
          if (opts.length > 0) {
            options = [...opts];
            break;
          }
        }
      }

      if (options.length > 0) {
        console.log(`Found ${options.length} make suggestions. Selecting first.`);
        const firstOption = options[0];
        firstOption.scrollIntoView({ block: 'center' });
        await sleep(200);
        fbSelectOption(firstOption);
        await sleep(500);
        return true;
      } else {
        console.log('No make suggestions found, submitting typed value');
        makeInput.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          bubbles: true
        }));
        return true;
      }

    } catch (e) {
      console.error('Error selecting make:', e);
    }

    return true; // Return true as we filled the input at least
  }

  async function fillModel() {
    // Get local copy to prevent null reference
    const postData = pendingPost;
    if (!postData || !postData.model) return false;

    console.log('=== Starting fillModel ===');

    // Strategy 1: Find input by label containing "Model"
    const allLabels = document.querySelectorAll('label');
    for (const label of allLabels) {
      const labelText = label.textContent || '';
      if (labelText.toLowerCase().includes('model') && !labelText.toLowerCase().includes('body')) {
        const input = label.querySelector('input[type="text"], input:not([type="file"])');
        if (input && isVisible(input)) {
          console.log('Found model input via label');
          return await fillInput([input], postData.model);
        }
      }
    }

    // Strategy 2: Find input near span containing "Model"
    const modelSpans = Array.from(document.querySelectorAll('span')).filter(span => {
      const text = span.textContent || '';
      return text.toLowerCase().trim() === 'model';
    });

    for (const span of modelSpans) {
      // Look for input in parent or sibling elements
      const parent = span.closest('label, div');
      if (parent) {
        const input = parent.querySelector('input[type="text"], input:not([type="file"])');
        if (input && isVisible(input)) {
          console.log('Found model input near Model span');
          return await fillInput([input], postData.model);
        }
      }
    }

    // Strategy 3: Standard selectors
    const selectors = [
      'input[placeholder*="model" i]',
      'input[aria-label*="model" i]'
    ];

    return await fillInput(selectors, postData.model);
  }

  async function fillMileage() {
    // Get local copy to prevent null reference
    const postData = pendingPost;
    if (!postData || !postData.mileage) return false;

    console.log('=== Starting fillMileage ===');

    const mileage = postData.mileage.replace(/[^\d]/g, '');

    // Strategy 1: Find input by label containing "Mileage"
    const allLabels = document.querySelectorAll('label');
    for (const label of allLabels) {
      const labelText = label.textContent || '';
      if (labelText.toLowerCase().includes('mileage')) {
        const input = label.querySelector('input[type="text"], input:not([type="file"])');
        if (input && isVisible(input)) {
          console.log('Found mileage input via label');
          return await fillInput([input], mileage);
        }
      }
    }

    // Strategy 2: Find input near span containing "Mileage"
    const mileageSpans = Array.from(document.querySelectorAll('span')).filter(span => {
      const text = span.textContent || '';
      return text.toLowerCase().trim() === 'mileage';
    });

    for (const span of mileageSpans) {
      // Look for input in parent or sibling elements
      const parent = span.closest('label, div');
      if (parent) {
        const input = parent.querySelector('input[type="text"], input:not([type="file"])');
        if (input && isVisible(input)) {
          console.log('Found mileage input near Mileage span');
          return await fillInput([input], mileage);
        }
      }
    }

    // Strategy 3: Standard selectors
    const selectors = [
      'input[placeholder*="mileage" i]',
      'input[aria-label*="mileage" i]',
      'input[placeholder*="odometer" i]'
    ];

    return await fillInput(selectors, mileage);
  }

  async function fillVIN() {
    // Get local copy to prevent null reference
    const postData = pendingPost;
    if (!postData || !postData.vin) return false;

    const selectors = [
      'input[placeholder*="vin" i]',
      'input[aria-label*="vin" i]',
      'input[placeholder*="vehicle identification" i]'
    ];

    return await fillInput(selectors, postData.vin);
  }

  async function fillPrice() {
    if (!pendingPost || !pendingPost.price) return false;

    const price = pendingPost.price.replace(/[^\d]/g, '');

    // Strategy 1: Find input by label containing "Price"
    const allLabels = document.querySelectorAll('label');
    for (const label of allLabels) {
      const labelText = label.textContent || '';
      if (labelText.toLowerCase().includes('price') && !labelText.toLowerCase().includes('original')) {
        const input = label.querySelector('input[type="text"], input[type="number"], input:not([type="file"])');
        if (input && isVisible(input)) {
          console.log('Found price input via label');
          return await fillInput([input], price);
        }
      }
    }

    // Strategy 2: Find input near span containing "Price"
    const priceSpans = Array.from(document.querySelectorAll('span')).filter(span => {
      const text = span.textContent || '';
      return text.toLowerCase().trim() === 'price';
    });

    for (const span of priceSpans) {
      // Look for input in parent or sibling elements
      const parent = span.closest('label, div');
      if (parent) {
        const input = parent.querySelector('input[type="text"], input[type="number"], input:not([type="file"])');
        if (input && isVisible(input)) {
          console.log('Found price input near Price span');
          return await fillInput([input], price);
        }
      }
    }

    // Strategy 3: Standard selectors
    const selectors = [
      'input[placeholder*="price" i]',
      'input[aria-label*="price" i]',
      'input[type="number"]',
      'input[inputmode="numeric"]',
      'input[id*="_r_"][type="text"]' // Facebook's dynamic ID pattern
    ];

    return await fillInput(selectors, price);
  }

  async function fillTitle() {
    // Get local copy to prevent null reference
    const postData = pendingPost;
    if (!postData || !postData.year || !postData.make || !postData.model) return false;

    const selectors = [
      'input[placeholder*="title" i]',
      'input[aria-label*="title" i]',
      'input[placeholder*="listing title" i]'
    ];

    let title = `${postData.year} ${postData.make} ${postData.model}`;
    if (postData.trim) {
      title += ` ${postData.trim}`;
    }

    // Add emoji if configured
    if (postData.config?.emoji && postData.config.emoji !== 'none') {
      const emojiMap = {
        'sparkle': '✨',
        'fire': '🔥',
        'star': '⭐',
        'checkmark': '✅'
      };
      const emoji = emojiMap[postData.config.emoji];
      if (emoji) {
        title = `${emoji} ${title} ${emoji}`;
      }
    }

    return await fillInput(selectors, title);
  }

  async function fillDescription() {
    console.log('=== Starting fillDescription ===');

    // Only use the actual description from pendingPost, don't generate random text
    if (!pendingPost.description) {
      console.log('No description provided, skipping description field');
      return false;
    }

    const description = pendingPost.description;
    console.log('Description to fill:', description.substring(0, 100) + '...');

    // Enhanced selectors for description field - prioritize actual input textareas
    // Look for textarea elements that are actual input fields, not preview/display elements
    let descriptionElement = null;

    // Wait for description field to appear (with retry)
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts && !descriptionElement) {
      // Strategy 1: Find textarea within a label that contains "Description" text
      // This is the most reliable method - Facebook uses labels with "Description" text
      const allLabels = document.querySelectorAll('label');
      for (const label of allLabels) {
        const labelText = label.textContent || '';
        // Look for label containing "Description" but not "Seller's description" or preview
        if (labelText.toLowerCase().includes('description') &&
          !labelText.toLowerCase().includes('seller') &&
          !labelText.toLowerCase().includes('preview')) {
          const textarea = label.querySelector('textarea');
          if (textarea && isVisible(textarea) && textarea.tagName === 'TEXTAREA') {
            // Make sure it's not in the preview/composer section
            const previewParent = label.closest('[aria-label*="Preview"], [aria-label*="preview"], [aria-label*="Marketplace composer"], [role="complementary"]');
            // Also check that it's not disabled or readonly
            if (!previewParent && !textarea.disabled && !textarea.readOnly) {
              // Verify it's in the main form area, not the sidebar preview
              const isInMainForm = label.closest('form, [role="form"], [aria-label="Marketplace"]');
              if (isInMainForm) {
                descriptionElement = textarea;
                console.log('Found description textarea via label in main form');
                break;
              }
            }
          }
        }
      }

      // Strategy 2: Find textarea that's not in preview section and is an actual input
      if (!descriptionElement) {
        const allTextareas = document.querySelectorAll('textarea');
        for (const textarea of allTextareas) {
          if (!isVisible(textarea)) continue;

          // Skip if it's in preview/composer section
          const isInPreview = textarea.closest('[aria-label*="Preview"], [aria-label*="preview"], [role="complementary"], [aria-label*="Marketplace composer"]');
          if (isInPreview) continue;

          // Skip if it's a display/preview element (check parent context)
          const parent = textarea.closest('div');
          if (parent) {
            const parentText = parent.textContent || '';
            // Skip if it's clearly a preview/display area
            if (parentText.includes('Seller\'s description') && !textarea.value) {
              continue;
            }
          }

          // Check if it's actually an input field (has proper attributes)
          if (textarea.tagName === 'TEXTAREA' &&
            !textarea.hasAttribute('inert') &&
            !textarea.hasAttribute('readonly') &&
            !textarea.disabled) {
            // Make sure it's in the main form area, not preview sidebar
            const formArea = textarea.closest('form, [role="form"], [aria-label="Marketplace"]');
            const isInSidebar = textarea.closest('[role="complementary"]');
            if (formArea && !isInSidebar) {
              descriptionElement = textarea;
              console.log('Found description textarea in form area');
              break;
            }
          }
        }
      }

      // Strategy 3: Fallback to contentEditable divs (but be more careful)
      if (!descriptionElement) {
        const contentEditableDivs = document.querySelectorAll('div[contenteditable="true"]');
        for (const div of contentEditableDivs) {
          if (!isVisible(div)) continue;

          // Skip preview/composer sections
          const isInPreview = div.closest('[aria-label*="Preview"], [aria-label*="preview"], [role="complementary"], [aria-label*="Marketplace composer"]');
          if (isInPreview) continue;

          // Check if it's near a "Description" label by checking parent context
          const parent = div.closest('label, div');
          if (parent) {
            const parentText = parent.textContent || '';
            const ariaLabel = div.getAttribute('aria-label') || '';

            // Check if it's associated with description and in main form
            const isInMainForm = div.closest('form, [role="form"], [aria-label="Marketplace"]');
            const isInSidebar = div.closest('[role="complementary"]');

            if (isInMainForm && !isInSidebar) {
              if (parentText.toLowerCase().includes('description') &&
                !parentText.toLowerCase().includes('seller') &&
                !parentText.toLowerCase().includes('preview')) {
                descriptionElement = div;
                console.log('Found description contentEditable div');
                break;
              }

              if (ariaLabel.toLowerCase().includes('description') &&
                !ariaLabel.toLowerCase().includes('seller') &&
                !ariaLabel.toLowerCase().includes('preview')) {
                descriptionElement = div;
                console.log('Found description contentEditable div via aria-label');
                break;
              }
            }
          }
        }
      }

      if (!descriptionElement) {
        await sleep(500); // Wait 500ms before retrying
        attempts++;
      }
    }

    if (!descriptionElement) {
      console.log('Description field not found after multiple attempts');
      return false;
    }

    // Focus the element
    descriptionElement.focus();
    await sleep(300);

    // Clear existing content
    if (descriptionElement.contentEditable === 'true' || descriptionElement.tagName === 'DIV') {
      // For contentEditable divs
      descriptionElement.textContent = '';
      descriptionElement.innerHTML = '';

      // Trigger events to notify React/Facebook
      descriptionElement.dispatchEvent(new Event('input', { bubbles: true }));
      descriptionElement.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(200);
    } else {
      // For textareas
      descriptionElement.value = '';
      descriptionElement.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(200);
    }

    // Type the description character by character with human-like typing
    console.log('Starting to type description...');
    const isContentEditable = descriptionElement.contentEditable === 'true' || descriptionElement.tagName === 'DIV';

    for (let i = 0; i < description.length; i++) {
      const char = description[i];

      if (isContentEditable) {
        // For contentEditable divs, append to textContent and innerHTML
        descriptionElement.textContent += char;

        // Handle line breaks properly
        if (char === '\n') {
          descriptionElement.innerHTML = descriptionElement.textContent.replace(/\n/g, '<br>');
        } else {
          descriptionElement.innerHTML = descriptionElement.textContent.replace(/\n/g, '<br>');
        }
      } else {
        // For textareas
        descriptionElement.value += char;
      }

      // Trigger input event for each character (important for React)
      const inputEvent = new Event('input', { bubbles: true, cancelable: true });
      descriptionElement.dispatchEvent(inputEvent);

      // Also trigger beforeInput for better React compatibility
      try {
        const beforeInputEvent = new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: char
        });
        descriptionElement.dispatchEvent(beforeInputEvent);
      } catch (e) {
        // beforeInput might not be available in all browsers
      }

      // Random delay between 20-80ms per character (faster for longer text)
      const delay = Math.floor(Math.random() * 60) + 20;
      await sleep(delay);

      // Occasionally add longer pauses (thinking time) - less frequent for description
      if (Math.random() < 0.05 && i > 0 && i < description.length - 1) {
        await sleep(Math.floor(Math.random() * 200) + 100);
      }

      // Log progress every 50 characters
      if (i % 50 === 0 && i > 0) {
        console.log(`Typed ${i}/${description.length} characters...`);
      }
    }

    // Final events to ensure React/Facebook recognizes the input
    descriptionElement.dispatchEvent(new Event('input', { bubbles: true }));
    descriptionElement.dispatchEvent(new Event('change', { bubbles: true }));

    // Trigger blur and focus to ensure value is saved
    descriptionElement.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(100);
    descriptionElement.focus();
    await sleep(100);

    // Verify the content was set
    const finalContent = isContentEditable
      ? descriptionElement.textContent || descriptionElement.innerText
      : descriptionElement.value;

    if (finalContent && finalContent.length > 0) {
      console.log(`✓ Description filled successfully (${finalContent.length} characters)`);
      return true;
    } else {
      console.log('✗ Description field appears empty after filling');
      return false;
    }
  }

  async function fillLocation() {
    if (!pendingPost || !pendingPost.dealerAddress) return false;

    console.log('=== Starting fillLocation ===');

    const selectors = [
      'input[placeholder*="location" i]',
      'input[aria-label*="location" i]',
      'input[placeholder*="address" i]'
    ];

    // Find the location input
    let locationInput = null;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && isVisible(element)) {
        locationInput = element;
        break;
      }
    }

    if (!locationInput) {
      console.log('Location input not found');
      return false;
    }

    // Focus and clear the input
    locationInput.focus();
    await sleep(300);

    // Clear existing value
    locationInput.value = '';
    locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    locationInput.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);

    // Type the location value character by character
    // Clean the location value to help Facebook's autocomplete
    // remove zip code (e.g. 70634) and "USA"
    // Type the location value character by character
    // Clean the location value to help Facebook's autocomplete
    let locationValue = pendingPost.dealerAddress || 'British Columbia'; // Default to BC as requested

    // Remove Zip Code (5 digits at the end)
    locationValue = locationValue.replace(/\s+\d{5}(-\d{4})?$/, '');


    // Remove Country
    locationValue = locationValue.replace(/,\s*(USA|United States)$/i, '');

    locationValue = locationValue.trim();

    console.log(`Cleaned location value: "${pendingPost.dealerAddress}" -> "${locationValue}"`);
    for (let i = 0; i < locationValue.length; i++) {
      locationInput.value += locationValue[i];
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(80 + Math.random() * 40);
    }

    // Final input event to trigger autocomplete
    locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(500);

    // Press ArrowDown to open/activate autocomplete
    locationInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      bubbles: true
    }));
    await sleep(300);

    // Wait for autocomplete suggestions using waitForOptions helper
    let options = null;
    try {
      options = await waitForOptions(3000);
      console.log(`Found ${options.length} location suggestions`);
    } catch (error) {
      console.log('Waiting for location options...', error.message);
      // Try alternative method to find options
      await sleep(1000);

      // Look for all possible autocomplete containers
      const allListboxes = document.querySelectorAll('[role="listbox"]');
      for (const listbox of allListboxes) {
        if (isVisible(listbox)) {
          const opts = listbox.querySelectorAll('[role="option"]');
          if (opts && opts.length > 0) {
            options = [...opts];
            console.log(`Found ${options.length} location suggestions in visible listbox`);
            break;
          }
        }
      }

      // If still no options, try finding by proximity to input
      if (!options || options.length === 0) {
        const inputParent = locationInput.closest('div, form, label');
        if (inputParent) {
          const nearbyListbox = inputParent.querySelector('[role="listbox"]');
          if (nearbyListbox && isVisible(nearbyListbox)) {
            const opts = nearbyListbox.querySelectorAll('[role="option"], div[role="option"], li[role="option"]');
            if (opts && opts.length > 0) {
              options = [...opts];
              console.log(`Found ${options.length} location suggestions near input`);
            }
          }
        }
      }
    }

    if (options && options.length > 0) {
      // Wait a bit before selecting to ensure autocomplete is fully loaded
      console.log('Waiting before selecting location option...');
      await sleep(2000);

      // Re-query options after delay to get fresh DOM references
      let firstOption = null;
      try {
        const freshOptions = await waitForOptions(2000);
        if (freshOptions && freshOptions.length > 0) {
          firstOption = freshOptions[0];
          console.log(`Re-queried and found ${freshOptions.length} location suggestions`);
        }
      } catch (e) {
        console.log('Could not re-query options, trying to find manually...');
        // Try to find options again manually
        const allListboxes = document.querySelectorAll('[role="listbox"]');
        for (const listbox of allListboxes) {
          if (isVisible(listbox)) {
            const opts = listbox.querySelectorAll('[role="option"]');
            if (opts && opts.length > 0) {
              firstOption = opts[0];
              console.log(`Found ${opts.length} location suggestions in listbox`);
              break;
            }
          }
        }
      }

      // Fallback to original options if re-query failed
      if (!firstOption && options && options.length > 0) {
        firstOption = options[0];
        console.log('Using original first option');
      }

      if (!firstOption) {
        console.log('⚠ First option not found after delay');
        return false;
      }

      const optionText = firstOption.textContent || firstOption.innerText || '';
      console.log(`Selecting first location suggestion (index 0): "${optionText}"`);

      // Find the clickable div inside the li element (div[tabindex="-1"])
      let clickableElement = firstOption;
      if (firstOption.tagName === 'LI') {
        const clickableDiv = firstOption.querySelector('div[tabindex="-1"]');
        if (clickableDiv) {
          clickableElement = clickableDiv;
          console.log('Found clickable div inside li element');
        }
      }

      // Scroll into view first
      clickableElement.scrollIntoView({ block: "center", behavior: "smooth" });
      await sleep(200);

      // Use the same selection method as other dropdowns
      fbSelectOption(clickableElement);

      await sleep(1000);

      // Verify selection by checking if input value changed
      const finalValue = locationInput.value || '';
      if (finalValue && finalValue.length > 0) {
        console.log(`✅ Location selected: "${finalValue}"`);
        return true;
      } else {
        // Try clicking directly on the clickable element
        console.log('Trying direct click on clickable element...');
        clickableElement.scrollIntoView({ block: "center" });
        await sleep(200);
        clickableElement.click();
        await sleep(500);

        // Also try clicking on the li element itself
        if (firstOption.tagName === 'LI' && clickableElement !== firstOption) {
          firstOption.click();
          await sleep(300);
        }

        const finalValue2 = locationInput.value || '';
        if (finalValue2 && finalValue2.length > 0) {
          console.log(`✅ Location selected (click method): "${finalValue2}"`);
          return true;
        }

        // Last resort: try keyboard navigation
        console.log('Trying keyboard navigation...');
        locationInput.focus();
        await sleep(100);
        locationInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          code: 'ArrowDown',
          keyCode: 40,
          bubbles: true
        }));
        await sleep(200);
        locationInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true
        }));
        await sleep(500);

        const finalValue3 = locationInput.value || '';
        if (finalValue3 && finalValue3.length > 0) {
          console.log(`✅ Location selected (keyboard method): "${finalValue3}"`);
          return true;
        }

        return false;
      }
    } else {
      console.log('⚠ No autocomplete suggestions found, submitting typed value');
      // Fallback: press Enter to submit the typed value
      locationInput.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        bubbles: true
      }));
      await sleep(300);
      return true;
    }
  }

  async function fillCondition() {
    if (!pendingPost || !pendingPost.condition) return false;

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
      return true;
    }
    return false;
  }

  /**
   * Select transmission by index from dropdown (similar to other dropdown selections)
   * @param {number} index - The index of the transmission option
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectTransmissionByIndex(index) {
    // Find transmission dropdown - look for label[role="combobox"] that contains "Transmission"
    let dropdown = null;

    // Strategy 1: Find all combobox labels and check which one has "Transmission" text
    const allComboboxLabels = document.querySelectorAll('label[role="combobox"][aria-haspopup="listbox"]');
    for (const label of allComboboxLabels) {
      const labelText = label.textContent || '';
      if (labelText.toLowerCase().includes('transmission')) {
        dropdown = label;
        console.log('Found transmission label combobox directly');
        break;
      }
    }

    // Strategy 2: Find span with "Transmission" and look for parent label with combobox role
    if (!dropdown) {
      const transmissionSpans = Array.from(document.querySelectorAll('span')).filter(span => {
        const text = span.textContent || '';
        return text.toLowerCase().trim() === 'transmission';
      });

      for (const span of transmissionSpans) {
        const label = span.closest('label[role="combobox"][aria-haspopup="listbox"]');
        if (label) {
          dropdown = label;
          console.log('Found transmission label via span');
          break;
        }

        // Also check parent div for label
        const parent = span.closest('div');
        if (parent) {
          const labelCombobox = parent.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
          if (labelCombobox) {
            dropdown = labelCombobox;
            console.log('Found transmission label in parent div');
            break;
          }

          // Look for div with tabindex="-1" (clickable dropdown trigger)
          const clickableDiv = parent.querySelector('div[tabindex="-1"]');
          if (clickableDiv) {
            const comboboxParent = clickableDiv.closest('label[role="combobox"]');
            if (comboboxParent) {
              dropdown = comboboxParent;
              console.log('Found transmission label via clickable div parent');
              break;
            }
          }
        }
      }
    }

    // Strategy 3: Find by aria-labelledby that points to "Transmission" span
    if (!dropdown) {
      const transmissionSpans = Array.from(document.querySelectorAll('span')).filter(span => {
        const text = span.textContent || '';
        return text.toLowerCase().includes('transmission');
      });

      for (const span of transmissionSpans) {
        const spanId = span.getAttribute('id');
        if (spanId) {
          const label = document.querySelector(`label[aria-labelledby="${spanId}"][role="combobox"]`);
          if (label) {
            dropdown = label;
            console.log('Found transmission label via aria-labelledby');
            break;
          }
        }
      }
    }

    if (!dropdown) {
      console.error('Transmission dropdown not found');
      return false;
    }

    // Reset state if dropdown is already open
    if (dropdown.getAttribute("aria-expanded") === "true") {
      dropdown.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true
        })
      );
      await sleep(200);
    }

    // Open dropdown - handle both label and div elements
    if (dropdown.tagName === 'DIV' && dropdown.getAttribute('tabindex') === '-1') {
      dropdown.scrollIntoView({ block: "center" });
      dropdown.focus();
      await sleep(100);
      dropdown.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      dropdown.click();
      dropdown.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true
      }));
    } else {
      openDropdown(dropdown);
    }

    // Wait for dropdown to expand
    try {
      await waitForExpanded(dropdown);
    } catch (error) {
      console.error('Error opening transmission dropdown:', error);
      return false;
    }

    // Wait for options to appear
    let options;
    try {
      options = await waitForOptions();
      console.log(`Found ${options.length} transmission options`);
    } catch (error) {
      console.error('Error waiting for transmission options:', error);
      return false;
    }

    // Select option by index
    const target = options[index];
    if (!target) {
      console.error(`Transmission option at index ${index} not found. Available indices: 0-${options.length - 1}`);
      return false;
    }

    console.log(`Selecting transmission at index ${index}: "${target.innerText || target.textContent}"`);
    fbSelectOption(target);

    await sleep(1000);

    // Verify selection
    const isClosed = dropdown.getAttribute('aria-expanded') === 'false';
    const selectedText = dropdown.textContent || '';

    if (isClosed && selectedText !== 'Transmission' && selectedText.trim() !== '') {
      console.log(`✅ Successfully selected transmission: "${selectedText}"`);
      return true;
    } else {
      console.log(`⚠ Transmission selection may not have worked. Closed: ${isClosed}, Text: "${selectedText}"`);
      return isClosed;
    }
  }

  /**
   * Select transmission by transmission name using the TRANSMISSION_INDEX mapping
   * @param {string} transmissionName - The transmission name (e.g., 'Automatic transmission', 'Manual transmission')
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectTransmission(transmissionName) {
    // First try exact match
    let index = TRANSMISSION_INDEX[transmissionName];

    // If not found, try case-insensitive match
    if (index === undefined) {
      const transLower = transmissionName.toLowerCase();
      const matchedKey = Object.keys(TRANSMISSION_INDEX).find(
        key => key.toLowerCase() === transLower
      );

      if (matchedKey) {
        index = TRANSMISSION_INDEX[matchedKey];
        transmissionName = matchedKey;
        console.log(`ℹ️ Case-insensitive match: "${transmissionName}"`);
      }
    }

    // Try common transmission name variations
    if (index === undefined) {
      const transLower = transmissionName.toLowerCase();
      const transVariations = {
        'automatic': 'Automatic transmission',
        'auto': 'Automatic transmission',
        'manual': 'Manual transmission',
        'stick': 'Manual transmission',
        'standard': 'Manual transmission'
      };

      if (transVariations[transLower]) {
        const matchedTrans = transVariations[transLower];
        index = TRANSMISSION_INDEX[matchedTrans];
        transmissionName = matchedTrans;
        console.log(`ℹ️ Transmission variation matched: "${transmissionName}"`);
      }
    }

    if (index === undefined) {
      console.error(`❌ Unknown transmission: "${transmissionName}". Available transmissions:`, Object.keys(TRANSMISSION_INDEX));
      return false;
    }

    console.log(`🚗 Selecting transmission: "${transmissionName}" (index: ${index})`);
    return await selectTransmissionByIndex(index);
  }

  async function fillTransmission() {
    if (!pendingPost || !pendingPost.transmission) return false;

    console.log('=== Starting fillTransmission ===');

    // Try index-based selection first (dropdown approach)
    const transmissionSelected = await selectTransmission(pendingPost.transmission);

    if (transmissionSelected) {
      return true;
    }

    // Fallback to text-based selection
    console.log('Dropdown selection failed, trying text-based selection...');
    const trans = pendingPost.transmission.toLowerCase();
    const isAutomatic = trans.includes('automatic');

    const element = findElementByText([
      isAutomatic ? 'Automatic transmission' : 'Manual transmission',
      isAutomatic ? 'Automatic' : 'Manual',
      trans
    ]);

    if (element) {
      simulateClick(element);
      await sleep(500);
      return true;
    }
    return false;
  }

  async function fillDrivetrain() {
    if (!pendingPost || !pendingPost.drivetrain) return false;

    const element = findElementByText([
      pendingPost.drivetrain,
      'AWD', 'FWD', 'RWD', '4WD'
    ]);

    if (element) {
      simulateClick(element);
      await sleep(500);
      return true;
    }
    return false;
  }

  /**
   * Select fuel type by index from dropdown (similar to vehicle type, year, and exterior color selection)
   * @param {number} index - The index of the fuel type option
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectFuelTypeByIndex(index) {
    // Find fuel type dropdown - look for label[role="combobox"] that contains "Fuel type"
    let dropdown = null;

    // Strategy 1: Find by aria-labelledby that points to "Fuel type" span (most reliable)
    const fuelTypeSpans = Array.from(document.querySelectorAll('span')).filter(span => {
      const text = span.textContent || '';
      return text.toLowerCase().trim() === 'fuel type' ||
        (text.toLowerCase().includes('fuel') && text.toLowerCase().includes('type') &&
          !text.toLowerCase().includes('vehicle'));
    });

    for (const span of fuelTypeSpans) {
      const spanId = span.getAttribute('id');
      if (spanId) {
        const label = document.querySelector(`label[aria-labelledby="${spanId}"][role="combobox"][aria-haspopup="listbox"]`);
        if (label) {
          dropdown = label;
          console.log('Found fuel type label via aria-labelledby');
          break;
        }
      }
    }

    // Strategy 2: Find span with "Fuel type" and look for parent label with combobox role
    if (!dropdown) {
      for (const span of fuelTypeSpans) {
        const label = span.closest('label[role="combobox"][aria-haspopup="listbox"]');
        if (label) {
          dropdown = label;
          console.log('Found fuel type label via span closest');
          break;
        }

        // Also check parent div for label
        const parent = span.closest('div');
        if (parent) {
          const labelCombobox = parent.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
          if (labelCombobox) {
            dropdown = labelCombobox;
            console.log('Found fuel type label in parent div');
            break;
          }

          // Also look for div with tabindex="-1" (clickable dropdown trigger)
          const clickableDiv = parent.querySelector('div[tabindex="-1"]');
          if (clickableDiv) {
            // Check if this div's parent has combobox role
            const comboboxParent = clickableDiv.closest('label[role="combobox"][aria-haspopup="listbox"]');
            if (comboboxParent) {
              dropdown = comboboxParent;
              console.log('Found fuel type label via clickable div parent');
              break;
            }
          }
        }
      }
    }

    // Strategy 3: Find all combobox labels and check which one has "Fuel type" text
    if (!dropdown) {
      const allComboboxLabels = document.querySelectorAll('label[role="combobox"][aria-haspopup="listbox"]');
      for (const label of allComboboxLabels) {
        const labelText = label.textContent || '';
        // Check if label contains "Fuel type" (not "Vehicle type" or other types)
        if (labelText.toLowerCase().includes('fuel') && labelText.toLowerCase().includes('type') &&
          !labelText.toLowerCase().includes('vehicle') && !labelText.toLowerCase().includes('exterior')) {
          dropdown = label;
          console.log('Found fuel type label combobox directly');
          break;
        }
      }
    }

    // Strategy 4: Find div with tabindex="-1" that has a span with "Fuel type" nearby, then find parent label
    if (!dropdown) {
      const allClickableDivs = document.querySelectorAll('div[tabindex="-1"]');
      for (const clickableDiv of allClickableDivs) {
        const parent = clickableDiv.closest('div');
        if (parent) {
          const parentText = parent.textContent || '';
          if (parentText.toLowerCase().includes('fuel') && parentText.toLowerCase().includes('type') &&
            !parentText.toLowerCase().includes('vehicle')) {
            const label = clickableDiv.closest('label[role="combobox"][aria-haspopup="listbox"]');
            if (label) {
              dropdown = label;
              console.log('Found fuel type label via clickable div in parent');
              break;
            }
          }
        }
      }
    }

    if (!dropdown) {
      console.error('Fuel type dropdown not found');
      return false;
    }

    console.log(`Found fuel type dropdown: ${dropdown.tagName}, role: ${dropdown.getAttribute('role')}, aria-labelledby: ${dropdown.getAttribute('aria-labelledby')}`);

    // Reset state if dropdown is already open
    if (dropdown.getAttribute("aria-expanded") === "true") {
      dropdown.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true
        })
      );
      await sleep(200);
    }

    // Open dropdown - try clickable div first (it's the actual trigger)
    console.log('Opening fuel type dropdown...');

    // For labels, try clicking the clickable div inside first (the actual trigger element)
    if (dropdown.tagName === 'LABEL') {
      const clickableDiv = dropdown.querySelector('div[tabindex="-1"]');
      if (clickableDiv) {
        console.log('Clicking clickable div (actual trigger)...');
        clickableDiv.scrollIntoView({ block: "center" });
        clickableDiv.focus();
        await sleep(100);

        // Use the same events as openDropdown but on the clickable div
        clickableDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        clickableDiv.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        clickableDiv.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        clickableDiv.click();

        clickableDiv.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            code: "ArrowDown",
            bubbles: true
          })
        );
        await sleep(200);
      } else {
        // Fallback to standard openDropdown if no clickable div found
        openDropdown(dropdown);
      }
    } else {
      openDropdown(dropdown);
    }

    // Wait for dropdown to expand
    try {
      await waitForExpanded(dropdown);
    } catch (error) {
      console.error('Error opening fuel type dropdown:', error);
      // Try standard openDropdown as fallback
      if (dropdown.tagName === 'LABEL') {
        console.log('Trying standard openDropdown as fallback...');
        openDropdown(dropdown);
        await sleep(500);

        const expanded = dropdown.getAttribute("aria-expanded") === "true";
        const listbox = document.querySelector('[role="listbox"]');
        if (!expanded && !listbox) {
          console.error('Fuel type dropdown still not open');
          return false;
        }
      } else {
        return false;
      }
    }

    // Wait for options to appear
    let options;
    try {
      options = await waitForOptions();
      console.log(`Found ${options.length} fuel type options`);
    } catch (error) {
      console.error('Error waiting for fuel type options:', error);
      return false;
    }

    // Select option by index
    const target = options[index];
    if (!target) {
      console.error(`Fuel type option at index ${index} not found. Available indices: 0-${options.length - 1}`);
      return false;
    }

    console.log(`Selecting fuel type at index ${index}: "${target.innerText || target.textContent}"`);
    fbSelectOption(target);

    await sleep(1000);

    // Verify selection
    const isClosed = dropdown.getAttribute('aria-expanded') === 'false';
    const selectedText = dropdown.textContent || '';

    if (isClosed && selectedText !== 'Fuel type' && selectedText.trim() !== '') {
      console.log(`✅ Successfully selected fuel type: "${selectedText}"`);
      return true;
    } else {
      console.log(`⚠ Fuel type selection may not have worked. Closed: ${isClosed}, Text: "${selectedText}"`);
      return isClosed;
    }
  }

  /**
   * Select fuel type by fuel type name using the FUEL_TYPE_INDEX mapping
   * @param {string} fuelTypeName - The fuel type name (e.g., 'Diesel', 'Electric', 'Petrol', 'Hybrid')
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectFuelType(fuelTypeName) {
    // First try exact match
    let index = FUEL_TYPE_INDEX[fuelTypeName];

    // If not found, try case-insensitive match
    if (index === undefined) {
      const fuelTypeLower = fuelTypeName.toLowerCase();
      const matchedKey = Object.keys(FUEL_TYPE_INDEX).find(
        key => key.toLowerCase() === fuelTypeLower
      );

      if (matchedKey) {
        index = FUEL_TYPE_INDEX[matchedKey];
        fuelTypeName = matchedKey; // Use the correct casing
        console.log(`ℹ️ Case-insensitive match: "${fuelTypeName}"`);
      }
    }

    // Try common fuel type name variations and engine-based detection
    if (index === undefined) {
      const fuelTypeLower = fuelTypeName.toLowerCase();
      const fuelVariations = {
        'gasoline': 'Petrol',
        'gas': 'Petrol',
        'petrol': 'Petrol',
        'diesel': 'Diesel',
        'electric': 'Electric',
        'ev': 'Electric',
        'hybrid': 'Hybrid',
        'plug-in hybrid': 'Plug-in hybrid',
        'plugin hybrid': 'Plug-in hybrid',
        'phev': 'Plug-in hybrid',
        'flex': 'Flex',
        'other': 'Other'
      };

      // Check direct match
      if (fuelVariations[fuelTypeLower]) {
        const matchedFuel = fuelVariations[fuelTypeLower];
        index = FUEL_TYPE_INDEX[matchedFuel];
        fuelTypeName = matchedFuel;
        console.log(`ℹ️ Fuel type variation matched: "${fuelTypeName}"`);
      } else {
        // Try to detect from engine description
        if (fuelTypeLower.includes('diesel')) {
          index = FUEL_TYPE_INDEX['Diesel'];
          fuelTypeName = 'Diesel';
        } else if (fuelTypeLower.includes('electric') || fuelTypeLower.includes('ev')) {
          index = FUEL_TYPE_INDEX['Electric'];
          fuelTypeName = 'Electric';
        } else if (fuelTypeLower.includes('hybrid')) {
          if (fuelTypeLower.includes('plug') || fuelTypeLower.includes('phev')) {
            index = FUEL_TYPE_INDEX['Plug-in hybrid'];
            fuelTypeName = 'Plug-in hybrid';
          } else {
            index = FUEL_TYPE_INDEX['Hybrid'];
            fuelTypeName = 'Hybrid';
          }
        } else if (fuelTypeLower.includes('petrol') || fuelTypeLower.includes('gasoline') || fuelTypeLower.includes('gas')) {
          index = FUEL_TYPE_INDEX['Petrol'];
          fuelTypeName = 'Petrol';
        } else if (fuelTypeLower.includes('flex')) {
          index = FUEL_TYPE_INDEX['Flex'];
          fuelTypeName = 'Flex';
        }
      }
    }

    if (index === undefined) {
      console.error(`❌ Unknown fuel type: "${fuelTypeName}". Available types:`, Object.keys(FUEL_TYPE_INDEX));
      return false;
    }

    console.log(`⛽ Selecting fuel type: "${fuelTypeName}" (index: ${index})`);
    return await selectFuelTypeByIndex(index);
  }

  async function fillFuelType() {
    // Check if we have fuelType directly, or try to derive from engine
    let fuelType = pendingPost.fuelType;

    if (!fuelType && pendingPost.engine) {
      // Derive fuel type from engine description (backward compatibility)
      const engine = pendingPost.engine.toLowerCase();
      if (engine.includes('diesel')) fuelType = 'Diesel';
      else if (engine.includes('electric') || engine.includes('ev')) fuelType = 'Electric';
      else if (engine.includes('hybrid')) {
        if (engine.includes('plug') || engine.includes('phev')) {
          fuelType = 'Plug-in hybrid';
        } else {
          fuelType = 'Hybrid';
        }
      } else if (engine.includes('petrol') || engine.includes('gasoline') || engine.includes('gas')) {
        fuelType = 'Petrol';
      } else if (engine.includes('flex')) {
        fuelType = 'Flex';
      }
    }

    if (!fuelType) {
      console.log('No fuel type provided');
      return false;
    }

    console.log('=== Starting fillFuelType ===');

    // Try index-based selection first (dropdown approach)
    const fuelTypeSelected = await selectFuelType(fuelType);

    if (fuelTypeSelected) {
      return true;
    }

    // Fallback to text-based selection
    console.log('Dropdown selection failed, trying text-based selection...');
    const element = findElementByText([fuelType]);
    if (element) {
      simulateClick(element);
      await sleep(500);
      return true;
    }
    return false;
  }

  /**
   * Select vehicle condition by index from dropdown (similar to other dropdown selections)
   * @param {number} index - The index of the condition option
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectConditionByIndex(index) {
    // Find condition dropdown - look for label with "Vehicle condition" text
    let dropdown = null;

    // Strategy 1: Find label[role="combobox"] directly that contains "Condition" text
    const allComboboxLabels = document.querySelectorAll('label[role="combobox"][aria-haspopup="listbox"]');
    for (const label of allComboboxLabels) {
      const labelText = label.textContent || '';
      const ariaLabel = label.getAttribute('aria-label') || '';

      // Check both text and aria-label
      if ((labelText.toLowerCase().includes('condition') && labelText.toLowerCase().includes('vehicle')) ||
        (ariaLabel.toLowerCase().includes('condition') && ariaLabel.toLowerCase().includes('vehicle'))) {
        dropdown = label;
        console.log('Found "Vehicle condition" label combobox directly');
        break;
      }

      // Fallback: just "condition" if strict match fails (but prioritize stricter matches first)
      if (!dropdown && (labelText.toLowerCase().trim() === 'condition' || ariaLabel.toLowerCase().trim() === 'condition')) {
        // Store potential match but verify strict ones first
        // Actually, let's just use it if we haven't found a better one by the end of loop
      }
    }

    // Strategy 1.5: Retry with just "Condition" if not found
    if (!dropdown) {
      for (const label of allComboboxLabels) {
        const labelText = label.textContent || '';
        const ariaLabel = label.getAttribute('aria-label') || '';
        if (labelText.toLowerCase().includes('condition') || ariaLabel.toLowerCase().includes('condition')) {
          // Exclude "Air conditioning" or unrelated
          if (!labelText.toLowerCase().includes('air') && !ariaLabel.toLowerCase().includes('air')) {
            dropdown = label;
            console.log('Found "Condition" label combobox (relaxed match)');
            break;
          }
        }
      }
    }

    // Strategy 2: Find span with "Condition" text and look for nearby combobox/dropdown
    if (!dropdown) {
      const conditionSpans = Array.from(document.querySelectorAll('span')).filter(span => {
        const text = (span.textContent || '').toLowerCase();
        return text.includes('condition') && !text.includes('air'); // Filter 'air conditioning'
      });

      // Sort spans: prefer "vehicle condition" over "condition"
      conditionSpans.sort((a, b) => {
        const aText = (a.textContent || '').toLowerCase();
        const bText = (b.textContent || '').toLowerCase();
        const aHasVehicle = aText.includes('vehicle');
        const bHasVehicle = bText.includes('vehicle');
        if (aHasVehicle && !bHasVehicle) return -1;
        if (!aHasVehicle && bHasVehicle) return 1;
        return 0;
      });

      for (const span of conditionSpans) {
        const parent = span.closest('div'); // Look up tree
        if (parent) {
          // Look for sibling or child combobox
          const labelCombobox = parent.parentElement?.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
          if (labelCombobox) {
            dropdown = labelCombobox;
            break;
          }

          // Look inside parent
          const internalCombobox = parent.querySelector('div[role="combobox"], label[role="combobox"]');
          if (internalCombobox) {
            dropdown = internalCombobox;
            break;
          }

          // Interactive DIV navigation
          // Facebook sometimes uses a div with tabindex="0" or "-1" as the trigger
          const clickableDiv = parent.parentElement?.querySelector('div[tabindex="0"], div[tabindex="-1"]');
          if (clickableDiv && clickableDiv !== span.parentElement) {
            // Verify it looks like a dropdown trigger
            dropdown = clickableDiv;
            break;
          }
        }
      }
    }

    // Strategy 3: Find by label with "Condition" text (broad)
    if (!dropdown) {
      const allLabels = document.querySelectorAll('label');
      for (const label of allLabels) {
        const labelText = (label.textContent || '').toLowerCase();
        if (labelText.includes('condition') && !labelText.includes('air')) {
          if (label.getAttribute('role') === 'combobox') {
            dropdown = label;
            break;
          }
          const combobox = label.querySelector('div[role="combobox"], label[role="combobox"]');
          if (combobox) {
            dropdown = combobox;
            break;
          }
        }
      }
    }

    if (!dropdown) {
      console.error('Vehicle condition dropdown not found');
      return false;
    }

    // Reset state if dropdown is already open
    if (dropdown.getAttribute("aria-expanded") === "true") {
      dropdown.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true
        })
      );
      await sleep(200);
    }

    // Open dropdown
    console.log(`Opening condition dropdown, tag: ${dropdown.tagName}, role: ${dropdown.getAttribute('role')}, tabindex: ${dropdown.getAttribute('tabindex')}`);

    if (dropdown.tagName === 'DIV' && dropdown.getAttribute('tabindex') === '-1') {
      dropdown.scrollIntoView({ block: "center" });
      dropdown.focus();
      await sleep(100);
      dropdown.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      dropdown.click();
      dropdown.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true
      }));
    } else {
      openDropdown(dropdown);
    }

    // Wait for dropdown to expand
    try {
      await waitForExpanded(dropdown);
    } catch (error) {
      console.error('Error opening condition dropdown:', error);
      await sleep(500);
      const expanded = dropdown.getAttribute("aria-expanded") === "true";
      const listbox = document.querySelector('[role="listbox"]');
      if (!expanded && !listbox) {
        console.error('Condition dropdown did not open after retry');
        return false;
      }
    }

    // Wait for options to appear
    let options;
    try {
      options = await waitForOptions();
      console.log(`Found ${options.length} condition options`);
    } catch (error) {
      console.error('Error waiting for condition options:', error);
      return false;
    }

    // Select option by index
    const target = options[index];
    if (!target) {
      console.error(`Condition option at index ${index} not found. Available indices: 0-${options.length - 1}`);
      return false;
    }

    console.log(`Selecting condition at index ${index}: "${target.innerText || target.textContent}"`);
    fbSelectOption(target);

    await sleep(1000);

    // Verify selection
    const isClosed = dropdown.getAttribute('aria-expanded') === 'false';
    const selectedText = dropdown.textContent || '';

    if (isClosed && selectedText !== 'Vehicle condition' && selectedText.trim() !== '') {
      console.log(`✅ Successfully selected condition: "${selectedText}"`);
      return true;
    } else {
      console.log(`⚠ Condition selection may not have worked. Closed: ${isClosed}, Text: "${selectedText}"`);
      return isClosed;
    }
  }

  /**
   * Select vehicle condition by condition name using the CONDITION_INDEX mapping
   * @param {string} conditionName - The condition name (e.g., 'Excellent', 'Very good', 'Good', 'Fair', 'Poor')
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectCondition(conditionName) {
    // First try exact match
    let index = CONDITION_INDEX[conditionName];

    // If not found, try case-insensitive match
    if (index === undefined) {
      const conditionLower = conditionName.toLowerCase();
      const matchedKey = Object.keys(CONDITION_INDEX).find(
        key => key.toLowerCase() === conditionLower
      );

      if (matchedKey) {
        index = CONDITION_INDEX[matchedKey];
        conditionName = matchedKey;
        console.log(`ℹ️ Case-insensitive match: "${conditionName}"`);
      }
    }

    // Try common condition name variations
    if (index === undefined) {
      const conditionLower = conditionName.toLowerCase();
      const conditionVariations = {
        'excellent': 'Excellent',
        'very good': 'Very good',
        'verygood': 'Very good',
        'good': 'Good',
        'fair': 'Fair',
        'poor': 'Poor',
        'new': 'Excellent',
        'used': 'Good',
        'pre-owned': 'Good'
      };

      if (conditionVariations[conditionLower]) {
        const matchedCondition = conditionVariations[conditionLower];
        index = CONDITION_INDEX[matchedCondition];
        conditionName = matchedCondition;
        console.log(`ℹ️ Condition variation matched: "${conditionName}"`);
      }
    }

    if (index === undefined) {
      console.error(`❌ Unknown condition: "${conditionName}". Available conditions:`, Object.keys(CONDITION_INDEX));
      return false;
    }

    console.log(`🚗 Selecting vehicle condition: "${conditionName}" (index: ${index})`);
    return await selectConditionByIndex(index);
  }

  async function fillCondition() {
    if (!pendingPost || !pendingPost.condition) return false;

    console.log('=== Starting fillCondition ===');

    // Try index-based selection first (dropdown approach)
    // Default to 'Very Good' if condition is missing, as requested
    const conditionValue = pendingPost.condition || 'Very Good';
    const conditionSelected = await selectCondition(conditionValue);

    if (conditionSelected) {
      return true;
    }

    // Fallback to text-based selection
    console.log('Dropdown selection failed, trying text-based selection...');
    const condition = pendingPost.condition ? pendingPost.condition.toLowerCase() : 'very good';

    const isNew = condition.includes('new');
    const targetTexts = [
      isNew ? 'New' : 'Used',
      isNew ? 'Brand New' : 'Pre-owned',
      'Excellent',
      'Very good',
      'Good',
      'Fair',
      'Poor'
    ];

    // Fallback for default
    if (condition === 'very good') {
      targetTexts.unshift('Very Good');
      targetTexts.unshift('very good');
    }

    const conditionElement = findElementByText(targetTexts);

    if (conditionElement) {
      simulateClick(conditionElement);
      await sleep(500);
      return true;
    }
    return false;
  }

  async function fillExteriorColor() {
    if (!pendingPost || !pendingPost.exteriorColor) return false;

    console.log('=== Starting fillExteriorColor ===');

    // Try index-based selection first (dropdown approach)
    const colorSelected = await selectExteriorColor(pendingPost.exteriorColor);

    if (colorSelected) {
      return true;
    }

    // Fallback to direct input if dropdown selection fails
    console.log('Dropdown selection failed, trying direct input...');
    const colorInput = document.querySelector('input[placeholder*="exterior" i], input[aria-label*="exterior" i]');
    if (colorInput && isVisible(colorInput)) {
      return await fillInput([colorInput], pendingPost.exteriorColor);
    }
    return false;
  }

  async function fillInteriorColor() {
    if (!pendingPost || !pendingPost.interiorColor) return false;

    console.log('=== Starting fillInteriorColor ===');

    // Try index-based selection first (dropdown approach)
    const colorSelected = await selectInteriorColor(pendingPost.interiorColor);

    if (colorSelected) {
      return true;
    }

    // Fallback to direct input if dropdown selection fails
    console.log('Dropdown selection failed, trying direct input...');
    const colorInput = document.querySelector('input[placeholder*="interior" i], input[aria-label*="interior" i]');
    if (colorInput && isVisible(colorInput)) {
      return await fillInput([colorInput], pendingPost.interiorColor);
    }
    return false;
  }

  /**
   * Select body style by index from dropdown (similar to other dropdown selections)
   * @param {number} index - The index of the body style option
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectBodyStyleByIndex(index) {
    // Find body style dropdown - look for label[role="combobox"] that contains "Body style"
    let dropdown = null;

    // Strategy 1: Find all combobox labels and check which one has "Body style" text
    const allComboboxLabels = document.querySelectorAll('label[role="combobox"][aria-haspopup="listbox"]');
    for (const label of allComboboxLabels) {
      const labelText = label.textContent || '';
      if (labelText.toLowerCase().includes('body') && labelText.toLowerCase().includes('style')) {
        dropdown = label;
        console.log('Found body style label combobox directly');
        break;
      }
    }

    // Strategy 2: Find span with "Body style" and look for parent label with combobox role
    if (!dropdown) {
      const bodyStyleSpans = Array.from(document.querySelectorAll('span')).filter(span => {
        const text = span.textContent || '';
        return text.toLowerCase().trim() === 'body style' ||
          (text.toLowerCase().includes('body') && text.toLowerCase().includes('style'));
      });

      for (const span of bodyStyleSpans) {
        const label = span.closest('label[role="combobox"][aria-haspopup="listbox"]');
        if (label) {
          dropdown = label;
          console.log('Found body style label via span');
          break;
        }

        // Also check parent div for label
        const parent = span.closest('div');
        if (parent) {
          const labelCombobox = parent.querySelector('label[role="combobox"][aria-haspopup="listbox"]');
          if (labelCombobox) {
            dropdown = labelCombobox;
            console.log('Found body style label in parent div');
            break;
          }

          // Look for div with tabindex="-1" (clickable dropdown trigger)
          const clickableDiv = parent.querySelector('div[tabindex="-1"]');
          if (clickableDiv) {
            // Check if this div's parent has combobox role
            const comboboxParent = clickableDiv.closest('label[role="combobox"]');
            if (comboboxParent) {
              dropdown = comboboxParent;
            } else {
              dropdown = clickableDiv;
            }
            console.log('Found body style via clickable div');
            break;
          }
        }
      }
    }

    // Strategy 3: Find by aria-labelledby that points to "Body style" span
    if (!dropdown) {
      const bodyStyleSpans = Array.from(document.querySelectorAll('span')).filter(span => {
        const text = span.textContent || '';
        return text.toLowerCase().includes('body') && text.toLowerCase().includes('style');
      });

      for (const span of bodyStyleSpans) {
        const spanId = span.getAttribute('id');
        if (spanId) {
          const label = document.querySelector(`label[aria-labelledby="${spanId}"][role="combobox"]`);
          if (label) {
            dropdown = label;
            console.log('Found body style label via aria-labelledby');
            break;
          }
        }
      }
    }

    if (!dropdown) {
      console.error('Body style dropdown not found');
      return false;
    }

    // Reset state if dropdown is already open
    if (dropdown.getAttribute("aria-expanded") === "true") {
      dropdown.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true
        })
      );
      await sleep(200);
    }

    // Open dropdown - handle both label and div elements
    if (dropdown.tagName === 'DIV' && dropdown.getAttribute('tabindex') === '-1') {
      // For div dropdowns, click directly
      dropdown.scrollIntoView({ block: "center" });
      dropdown.focus();
      await sleep(100);
      dropdown.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      dropdown.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      dropdown.click();
      dropdown.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true
      }));
    } else {
      // For label dropdowns, use standard openDropdown
      openDropdown(dropdown);
    }

    // Wait for dropdown to expand
    try {
      await waitForExpanded(dropdown);
    } catch (error) {
      console.error('Error opening body style dropdown:', error);
      return false;
    }

    // Wait for options to appear
    let options;
    try {
      options = await waitForOptions();
      console.log(`Found ${options.length} body style options`);
    } catch (error) {
      console.error('Error waiting for body style options:', error);
      return false;
    }

    // Select option by index
    const target = options[index];
    if (!target) {
      console.error(`Body style option at index ${index} not found. Available indices: 0-${options.length - 1}`);
      return false;
    }

    console.log(`Selecting body style at index ${index}: "${target.innerText || target.textContent}"`);
    fbSelectOption(target);

    await sleep(1000);

    // Verify selection
    const isClosed = dropdown.getAttribute('aria-expanded') === 'false';
    const selectedText = dropdown.textContent || '';

    if (isClosed && selectedText !== 'Body style' && selectedText.trim() !== '') {
      console.log(`✅ Successfully selected body style: "${selectedText}"`);
      return true;
    } else {
      console.log(`⚠ Body style selection may not have worked. Closed: ${isClosed}, Text: "${selectedText}"`);
      return isClosed;
    }
  }

  /**
   * Select body style by body style name using the BODY_STYLE_INDEX mapping
   * @param {string} bodyStyleName - The body style name (e.g., 'Saloon', 'Hatchback', 'Coupé')
   * @returns {Promise<boolean>} - Returns true if selection was successful
   */
  async function selectBodyStyle(bodyStyleName) {
    // First try exact match
    let index = BODY_STYLE_INDEX[bodyStyleName];

    // If not found, try case-insensitive match
    if (index === undefined) {
      const bodyStyleLower = bodyStyleName.toLowerCase();
      const matchedKey = Object.keys(BODY_STYLE_INDEX).find(
        key => key.toLowerCase() === bodyStyleLower
      );

      if (matchedKey) {
        index = BODY_STYLE_INDEX[matchedKey];
        bodyStyleName = matchedKey; // Use the correct casing
        console.log(`ℹ️ Case-insensitive match: "${bodyStyleName}"`);
      }
    }

    // Try common body style name variations
    if (index === undefined) {
      const bodyStyleLower = bodyStyleName.toLowerCase();
      const bodyStyleVariations = {
        'coupe': 'Coupé',
        'coupe': 'Coupé',
        'sedan': 'Saloon',
        'saloon': 'Saloon',
        'hatchback': 'Hatchback',
        'suv': '4x4',
        'sport utility vehicle': '4x4',
        '4x4': '4x4',
        'convertible': 'Convertible',
        'wagon': 'Estate',
        'estate': 'Estate',
        'station wagon': 'Estate',
        'mpv': 'MPV/People carrier',
        'people carrier': 'MPV/People carrier',
        'minivan': 'MPV/People carrier',
        'small car': 'Small car',
        'compact': 'Small car',
        'van': 'Van',
        'other': 'Other'
      };

      if (bodyStyleVariations[bodyStyleLower]) {
        const matchedStyle = bodyStyleVariations[bodyStyleLower];
        index = BODY_STYLE_INDEX[matchedStyle];
        bodyStyleName = matchedStyle;
        console.log(`ℹ️ Body style variation matched: "${bodyStyleName}"`);
      }
    }

    if (index === undefined) {
      console.error(`❌ Unknown body style: "${bodyStyleName}". Available styles:`, Object.keys(BODY_STYLE_INDEX));
      return false;
    }

    console.log(`🚗 Selecting body style: "${bodyStyleName}" (index: ${index})`);
    return await selectBodyStyleByIndex(index);
  }

  async function fillBodyStyle() {
    if (!pendingPost || !pendingPost.bodyStyle) return false;

    console.log('=== Starting fillBodyStyle ===');

    // Try index-based selection first (dropdown approach)
    const bodyStyleSelected = await selectBodyStyle(pendingPost.bodyStyle);

    if (bodyStyleSelected) {
      return true;
    }

    // Fallback to text-based selection
    console.log('Dropdown selection failed, trying text-based selection...');
    const element = findElementByText([pendingPost.bodyStyle]);
    if (element) {
      simulateClick(element);
      await sleep(500);
      return true;
    }
    return false;
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
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
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
      throw error; // Re-throw to allow caller to handle it
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

    // Focus first
    element.focus();

    // Trigger mousedown, mouseup, and click events in sequence
    const mouseDownEvent = new MouseEvent('mousedown', {
      view: window,
      bubbles: true,
      cancelable: true,
      buttons: 1
    });
    element.dispatchEvent(mouseDownEvent);

    const mouseUpEvent = new MouseEvent('mouseup', {
      view: window,
      bubbles: true,
      cancelable: true,
      buttons: 1
    });
    element.dispatchEvent(mouseUpEvent);

    // Native click
    element.click();

    // Also dispatch click event
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      buttons: 1
    });
    element.dispatchEvent(clickEvent);

    // For elements with role="combobox", also trigger keyboard events
    if (element.getAttribute('role') === 'combobox') {
      const keyDownEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(keyDownEvent);

      const keyUpEvent = new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(keyUpEvent);
    }
  }

  function findElementByText(texts) {
    // Search in listbox first if available
    const listbox = document.querySelector('[role="listbox"]');
    const searchScope = listbox || document;

    const allElements = searchScope.querySelectorAll('span, button, label, div[role="button"], div[role="option"], li, div[tabindex]');

    for (const text of texts) {
      for (const el of allElements) {
        const elText = el.textContent?.trim() || '';
        if (elText.toLowerCase() === text.toLowerCase() ||
          (text.toLowerCase().includes('car') && elText.toLowerCase().includes('car') && elText.toLowerCase().includes('van'))) {
          // Make sure element is visible and clickable
          if (isVisible(el)) {
            return el;
          }
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
      // Check immediately
      const element = document.querySelector(selector);
      if (element && isVisible(element)) {
        resolve(element);
        return;
      }

      let checkInterval = null;
      let observer = null;
      const startTime = Date.now();

      const checkElement = () => {
        const element = document.querySelector(selector);
        if (element && isVisible(element)) {
          if (checkInterval) clearInterval(checkInterval);
          if (observer) observer.disconnect();
          resolve(element);
          return true;
        }
        return false;
      };

      const cleanup = () => {
        if (checkInterval) clearInterval(checkInterval);
        if (observer) observer.disconnect();
      };

      // Check periodically
      checkInterval = setInterval(() => {
        if (checkElement()) return;
        if (Date.now() - startTime >= timeout) {
          cleanup();
          reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }
      }, 100);

      observer = new MutationObserver(() => {
        if (checkElement()) return;
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      setTimeout(() => {
        cleanup();
        // Final check before rejecting
        const finalElement = document.querySelector(selector);
        if (finalElement) {
          resolve(finalElement);
        } else {
          reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }
      }, timeout);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function sendProgressUpdate(message) {
    safeChromeRuntimeSendMessage({
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

        // Get local copy to prevent null reference
        const postData = pendingPost;
        if (!postData) {
          console.log('pendingPost is null, cannot verify post');
          return false;
        }

        // Check if VIN or vehicle title appears in selling listings
        if (postData.vin && html.includes(postData.vin)) {
          console.log('✓ Post verified in Selling tab by VIN');
          notifyPostSuccess(true);
          return true;
        }

        const vehicleTitle = `${postData.year || ''} ${postData.make || ''} ${postData.model || ''}`.trim();
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

    safeChromeRuntimeSendMessage({
      action: 'postComplete',
      success: verified,
      vin: pendingPost?.vin,
      listingUrl: listingUrl,
      verified: verified,
      message: message,
      vehicleData: pendingPost
    });

    // Clear pending post if verified
    if (verified) {
      safeChromeStorageRemove('pendingPost');

      if (observer) {
        observer.disconnect();
      }

      // Stop error check interval
      if (errorCheckInterval) {
        clearInterval(errorCheckInterval);
        errorCheckInterval = null;
      }
    }
  }

  // Check for errors - with context validation (only while filling)
  let errorCheckInterval = null;

  function startErrorCheck() {
    if (errorCheckInterval) return; // Already running

    errorCheckInterval = setInterval(() => {
      try {
        // Stop interval if extension context is invalidated
        if (!isExtensionContextValid()) {
          console.log('Extension context invalidated, stopping error check interval');
          if (errorCheckInterval) {
            clearInterval(errorCheckInterval);
            errorCheckInterval = null;
          }
          return;
        }

        // Stop if all fields are filled or max attempts reached
        if (filledFields.size >= 5 || fillAttempts >= MAX_ATTEMPTS) {
          if (errorCheckInterval) {
            clearInterval(errorCheckInterval);
            errorCheckInterval = null;
          }
          return;
        }

        // Check for post completion (with error handling)
        try {
          detectPostCompletion();
        } catch (error) {
          console.error('Error in detectPostCompletion:', error);
        }

        // Check for errors - be more specific to avoid false positives
        // Look for error messages in specific containers (not just anywhere on page)
        const errorContainers = Array.from(document.querySelectorAll(
          '[role="alert"], ' +
          '[aria-live="assertive"], ' +
          '[class*="error"], ' +
          '[class*="Error"], ' +
          '[data-testid*="error"]'
        ));

        // Also check for aria-label containing error (case-insensitive check in JS)
        const allAriaLabels = document.querySelectorAll('[aria-label]');
        for (const el of allAriaLabels) {
          const ariaLabel = el.getAttribute('aria-label') || '';
          if (ariaLabel.toLowerCase().includes('error')) {
            errorContainers.push(el);
          }
        }

        let foundError = false;

        // Check specific error containers first
        for (const container of errorContainers) {
          if (!isVisible(container)) continue;

          const containerText = container.textContent || '';
          // Look for specific Facebook error messages
          if (containerText.includes('Something went wrong') ||
            containerText.includes('Please try again') ||
            containerText.match(/error/i) && containerText.length < 200) { // Short error messages only
            foundError = true;
            console.warn('Detected error message in container:', containerText.substring(0, 100));
            break;
          }
        }

        // If no error in containers, check for specific error patterns in form area
        if (!foundError) {
          const formArea = document.querySelector('form, [role="form"], [aria-label="Marketplace"]');
          if (formArea) {
            const formText = formArea.textContent || '';
            // Only check for specific error messages, not generic "Error"
            if (formText.includes('Something went wrong') ||
              formText.includes('Please try again') ||
              formText.includes('An error occurred')) {
              foundError = true;
              console.warn('Detected error message in form area');
            }
          }
        }

        if (foundError) {
          sendProgressUpdate('Error detected. Please check the form.');
          // Stop checking after detecting error
          if (errorCheckInterval) {
            clearInterval(errorCheckInterval);
            errorCheckInterval = null;
          }
        }
      } catch (error) {
        // Catch any errors in the error check itself to prevent crashes
        console.error('Error in error check interval:', error);
        // Don't stop the interval, just log the error
      }
    }, 5000); // Check every 5 seconds instead of 2
  }

  // Start error check when observer starts
  if (observer) {
    startErrorCheck();
  }

  // --- Checkbox/Radio Functions (Added) ---

  async function fillCleanTitle() {
    console.log('=== Filling Clean Title ===');
    const texts = ["This vehicle has a clean title", "Clean title"];

    for (const text of texts) {
      const labels = Array.from(document.querySelectorAll('label')).filter(l => (l.innerText || l.textContent).includes(text));

      for (const label of labels) {
        if (!isVisible(label)) continue;

        const input = label.querySelector('input[type="checkbox"], input[type="radio"]');
        if (input) {
          if (!input.checked) {
            console.log(`Clicking Clean Title checkbox inside label: ${text}`);
            input.click();
            await sleep(300);
          }
          return true;
        }

        const divCheckbox = label.querySelector('div[role="checkbox"], div[role="radio"]');
        if (divCheckbox) {
          if (divCheckbox.getAttribute('aria-checked') !== 'true') {
            console.log(`Clicking Clean Title div-checkbox: ${text}`);
            divCheckbox.click();
            await sleep(300);
          }
          return true;
        }
      }
    }
    return false;
  }

  async function fillNoDamage() {
    console.log('=== Filling No Damage ===');
    const labels = Array.from(document.querySelectorAll('label')).filter(l => (l.innerText || l.textContent).includes("no significant damage"));

    for (const label of labels) {
      if (!isVisible(label)) continue;
      const input = label.querySelector('input[type="checkbox"]');
      if (input) {
        if (!input.checked) {
          console.log('Clicking No Damage checkbox');
          input.click();
          await sleep(300);
        }
        return true;
      }

      const divCheckbox = label.querySelector('div[role="checkbox"]');
      if (divCheckbox) {
        if (divCheckbox.getAttribute('aria-checked') !== 'true') {
          console.log('Clicking No Damage div-checkbox');
          divCheckbox.click();
          await sleep(300);
        }
        return true;
      }
    }
    return false;
  }

  // --- Checkbox/Radio Functions (Added) ---

  async function fillCleanTitle() {
    console.log('=== Filling Clean Title ===');
    const texts = ["This vehicle has a clean title", "Clean title"];

    for (const text of texts) {
      const labels = Array.from(document.querySelectorAll('label')).filter(l => (l.innerText || l.textContent).includes(text));

      for (const label of labels) {
        if (!isVisible(label)) continue;

        const input = label.querySelector('input[type="checkbox"], input[type="radio"]');
        if (input) {
          if (!input.checked) {
            console.log(`Clicking Clean Title checkbox inside label: ${text}`);
            input.click();
            await sleep(300);
          }
          return true;
        }

        const divCheckbox = label.querySelector('div[role="checkbox"], div[role="radio"]');
        if (divCheckbox) {
          if (divCheckbox.getAttribute('aria-checked') !== 'true') {
            console.log(`Clicking Clean Title div-checkbox: ${text}`);
            divCheckbox.click();
            await sleep(300);
          }
          return true;
        }
      }
    }
    return false;
  }



})();

