// facebook-autofill.js
// Content script that automatically fills Facebook Marketplace vehicle listing forms
// Uses MutationObserver to detect DOM changes and fill fields dynamically

(function() {
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

  // Initialize the autofill agent
  init();

  async function init() {
    try {
      // Load pending post data
      const stored = await safeChromeStorageGet(['pendingPost']);
      if (stored.pendingPost) {
        pendingPost = stored.pendingPost;
        console.log('Loaded pending post:', pendingPost);
        
        // Start observing DOM for form elements
        startObserver();
        
        // Try initial fill after delay with context validation
        setTimeout(() => {
          if (isExtensionContextValid()) {
            attemptAutoFill();
          } else {
            console.log('Extension context invalidated, skipping initial autofill');
          }
        }, 2000);
      } else {
        console.log('No pending post data found');
      }
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
      if (filledFields.size < 5) { // Basic fields: category, year, make, model, price
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

    try {
      // Wait for form to be ready
      await waitForElement('[role="dialog"], form, [data-pagelet]', 2000);
      
      // Fill different form sections based on what's visible (only if not already filled)
      if (!filledFields.has('category')) {
        const categoryFilled = await fillVehicleCategory();
        if (categoryFilled) filledFields.add('category');
      }
      
      if (!filledFields.has('year') && pendingPost.year) {
        const yearFilled = await fillYear();
        if (yearFilled) filledFields.add('year');
      }
      
      if (!filledFields.has('make') && pendingPost.make) {
        const makeFilled = await fillMake();
        if (makeFilled) filledFields.add('make');
      }
      
      if (!filledFields.has('model') && pendingPost.model) {
        const modelFilled = await fillModel();
        if (modelFilled) filledFields.add('model');
      }
      
      if (!filledFields.has('mileage') && pendingPost.mileage) {
        const mileageFilled = await fillMileage();
        if (mileageFilled) filledFields.add('mileage');
      }
      
      if (!filledFields.has('vin') && pendingPost.vin) {
        const vinFilled = await fillVIN();
        if (vinFilled) filledFields.add('vin');
      }
      
      if (!filledFields.has('price') && pendingPost.price) {
        const priceFilled = await fillPrice();
        if (priceFilled) filledFields.add('price');
      }
      
      if (!filledFields.has('title') && pendingPost.year && pendingPost.make && pendingPost.model) {
        const titleFilled = await fillTitle();
        if (titleFilled) filledFields.add('title');
      }
      
      // Description should only be filled once with the actual description
      if (!filledFields.has('description')) {
        const descFilled = await fillDescription();
        if (descFilled) filledFields.add('description');
      }
      
      if (!filledFields.has('location') && pendingPost.dealerAddress) {
        const locationFilled = await fillLocation();
        if (locationFilled) filledFields.add('location');
      }
      
      if (!filledFields.has('condition') && pendingPost.condition) {
        const conditionFilled = await fillCondition();
        if (conditionFilled) filledFields.add('condition');
      }
      
      if (!filledFields.has('transmission') && pendingPost.transmission) {
        const transmissionFilled = await fillTransmission();
        if (transmissionFilled) filledFields.add('transmission');
      }
      
      if (!filledFields.has('drivetrain') && pendingPost.drivetrain) {
        const drivetrainFilled = await fillDrivetrain();
        if (drivetrainFilled) filledFields.add('drivetrain');
      }
      
      if (!filledFields.has('fuelType') && pendingPost.engine) {
        const fuelFilled = await fillFuelType();
        if (fuelFilled) filledFields.add('fuelType');
      }
      
      if (!filledFields.has('exteriorColor') && pendingPost.exteriorColor) {
        const extColorFilled = await fillExteriorColor();
        if (extColorFilled) filledFields.add('exteriorColor');
      }
      
      if (!filledFields.has('interiorColor') && pendingPost.interiorColor) {
        const intColorFilled = await fillInteriorColor();
        if (intColorFilled) filledFields.add('interiorColor');
      }
      
      // Handle images (only once)
      if (!filledFields.has('images') && pendingPost.images && pendingPost.images.length > 0) {
        await handleImages();
        filledFields.add('images');
      }
      
      // Notify user of progress
      sendProgressUpdate('Auto-fill in progress...');
      
    } catch (error) {
      console.error('Auto-fill error:', error);
    } finally {
      isFilling = false;
    }
  }

  // ============ Field Filling Functions ============

  async function fillVehicleCategory() {
    console.log('=== Starting fillVehicleCategory ===');
    
    // Find the dropdown trigger (label with "Vehicle type")
    let dropdownElement = null;
    const allLabels = document.querySelectorAll('label[role="combobox"], label[aria-haspopup="listbox"]');
    
    for (const label of allLabels) {
      const text = label.textContent || '';
      const ariaLabel = label.getAttribute('aria-labelledby');
      const labelElement = ariaLabel ? document.getElementById(ariaLabel) : null;
      const labelText = labelElement?.textContent || '';
      
      if (text.includes('Vehicle type') || text.includes('Vehicle Type') || 
          labelText.includes('Vehicle type') || labelText.includes('Vehicle Type')) {
        dropdownElement = label;
        console.log('Found dropdown element:', dropdownElement);
        break;
      }
    }
    
    if (!dropdownElement) {
      console.log('Vehicle type dropdown not found');
      return false;
    }
    
    // Check current state
    const isOpen = dropdownElement.getAttribute('aria-expanded') === 'true';
    console.log('Dropdown is open:', isOpen);
    
    // Open dropdown if not open
    if (!isOpen) {
      console.log('Clicking to open dropdown...');
      
      // Try multiple click methods
      dropdownElement.focus();
      await sleep(200);
      
      // Method 1: Direct click
      dropdownElement.click();
      await sleep(300);
      
      // Method 2: Mouse events
      const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      dropdownElement.dispatchEvent(mouseDown);
      await sleep(50);
      dropdownElement.dispatchEvent(mouseUp);
      await sleep(50);
      dropdownElement.dispatchEvent(click);
      
      // Method 3: Keyboard Enter
      const keyDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
      const keyUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
      dropdownElement.dispatchEvent(keyDown);
      await sleep(50);
      dropdownElement.dispatchEvent(keyUp);
      
      await sleep(1500); // Wait for dropdown to fully open
    }
    
    // Wait for listbox to appear (could be in a portal/overlay)
    let listbox = null;
    let attempts = 0;
    const maxAttempts = 15;
    
    while (attempts < maxAttempts && !listbox) {
      // Check main document
      listbox = document.querySelector('[role="listbox"]');
      
      // Also check if dropdown is now expanded
      if (dropdownElement.getAttribute('aria-expanded') === 'true') {
        // Listbox might be in a portal, search more broadly
        if (!listbox) {
          // Look for any visible div that might contain options
          const allDivs = document.querySelectorAll('div[role="listbox"], div[aria-label*="listbox"], ul[role="listbox"]');
          for (const div of allDivs) {
            if (isVisible(div)) {
              listbox = div;
              console.log('Found listbox in portal:', listbox);
              break;
            }
          }
        }
      }
      
      if (listbox && isVisible(listbox)) {
        console.log('Listbox found and visible');
        break;
      }
      
      await sleep(200);
      attempts++;
    }
    
    if (!listbox) {
      console.log('Listbox did not appear. Trying to find options anyway...');
    }
    
    // Search for the option - try multiple strategies
    const optionTexts = ['Car/van', 'Car/Van', 'car/van', 'Car', 'Vehicle'];
    let vehicleOption = null;
    
    // Strategy 1: Search in listbox
    if (listbox) {
      console.log('Searching in listbox...');
      const selectors = [
        '[role="option"]',
        'div[tabindex]',
        'li',
        'div[role="button"]',
        'span[role="button"]',
        'div[aria-selected]',
        'div[data-testid*="option"]'
      ];
      
      for (const selector of selectors) {
        const options = listbox.querySelectorAll(selector);
        console.log(`Found ${options.length} elements with selector: ${selector}`);
        
        for (const option of options) {
          const text = (option.textContent || '').trim();
          console.log(`Checking option text: "${text}"`);
          
          for (const searchText of optionTexts) {
            const normalizedText = text.toLowerCase();
            const normalizedSearch = searchText.toLowerCase();
            
            if (normalizedText === normalizedSearch || 
                (normalizedText.includes('car') && normalizedText.includes('van')) ||
                (normalizedText === 'car/van')) {
              vehicleOption = option;
              console.log(`✓ Found matching option: "${text}"`);
              break;
            }
          }
          if (vehicleOption) break;
        }
        if (vehicleOption) break;
      }
    }
    
    // Strategy 2: Search entire document for visible options
    if (!vehicleOption) {
      console.log('Searching entire document for options...');
      const allClickable = document.querySelectorAll('div[role="option"], div[tabindex], li, span, div[role="button"]');
      
      for (const el of allClickable) {
        if (!isVisible(el)) continue;
        
        const text = (el.textContent || '').trim();
        if (!text) continue;
        
        for (const searchText of optionTexts) {
          const normalizedText = text.toLowerCase();
          const normalizedSearch = searchText.toLowerCase();
          
          if (normalizedText === normalizedSearch || 
              (normalizedText.includes('car') && normalizedText.includes('van'))) {
            // Make sure it's in a dropdown context
            const parent = el.closest('[role="listbox"], [role="combobox"], [aria-haspopup="listbox"]');
            if (parent || listbox?.contains(el)) {
              vehicleOption = el;
              console.log(`✓ Found option in document: "${text}"`);
              break;
            }
          }
        }
        if (vehicleOption) break;
      }
    }
    
    // Strategy 3: Try keyboard navigation as fallback
    if (!vehicleOption && listbox) {
      console.log('Trying keyboard navigation...');
      dropdownElement.focus();
      await sleep(200);
      
      // Press Arrow Down to navigate
      const arrowDown = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true });
      dropdownElement.dispatchEvent(arrowDown);
      await sleep(300);
      
      // Try Enter to select first option
      const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
      dropdownElement.dispatchEvent(enter);
      await sleep(500);
      
      // Check if selection was made
      const selectedText = dropdownElement.textContent || '';
      if (selectedText.includes('Car') || selectedText.includes('car')) {
        console.log('Selection made via keyboard');
        return true;
      }
    }
    
    // Click the option if found
    if (vehicleOption) {
      console.log('Attempting to click option:', vehicleOption.textContent);
      
      // Scroll into view
      vehicleOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);
      
      // Try multiple click methods
      vehicleOption.focus();
      await sleep(100);
      
      // Method 1: Direct click
      vehicleOption.click();
      await sleep(200);
      
      // Method 2: Mouse events
      const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 });
      const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true, buttons: 1 });
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, buttons: 1 });
      
      vehicleOption.dispatchEvent(mouseDown);
      await sleep(50);
      vehicleOption.dispatchEvent(mouseUp);
      await sleep(50);
      vehicleOption.dispatchEvent(click);
      
      // Method 3: Touch events (for mobile-like interactions)
      const touchStart = new TouchEvent('touchstart', { bubbles: true, cancelable: true });
      const touchEnd = new TouchEvent('touchend', { bubbles: true, cancelable: true });
      try {
        vehicleOption.dispatchEvent(touchStart);
        await sleep(50);
        vehicleOption.dispatchEvent(touchEnd);
      } catch (e) {
        // Touch events might not be available
      }
      
      await sleep(800);
      
      // Verify selection
      const isNowClosed = dropdownElement.getAttribute('aria-expanded') === 'false';
      const selectedValue = dropdownElement.textContent || '';
      
      console.log('After click - Dropdown closed:', isNowClosed);
      console.log('After click - Selected value:', selectedValue);
      
      if (isNowClosed || selectedValue.includes('Car') || selectedValue.includes('car')) {
        console.log('✓ Selection successful!');
        return true;
      } else {
        console.log('⚠ Selection may not have worked, but continuing...');
        return true; // Return true anyway to continue
      }
    } else {
      console.log('✗ Vehicle option not found');
      return false;
    }
  }

  async function fillYear() {
    if (!pendingPost.year) return false;
    
    const selectors = [
      'input[placeholder*="year" i]',
      'input[aria-label*="year" i]',
      'input[name*="year" i]'
    ];

    return await fillInput(selectors, pendingPost.year);
  }

  async function fillMake() {
    if (!pendingPost.make) return false;
    
    const selectors = [
      'input[placeholder*="make" i]',
      'input[aria-label*="make" i]',
      'input[placeholder*="brand" i]'
    ];

    return await fillInput(selectors, pendingPost.make);
  }

  async function fillModel() {
    if (!pendingPost.model) return false;
    
    const selectors = [
      'input[placeholder*="model" i]',
      'input[aria-label*="model" i]'
    ];

    return await fillInput(selectors, pendingPost.model);
  }

  async function fillMileage() {
    if (!pendingPost.mileage) return false;
    
    const selectors = [
      'input[placeholder*="mileage" i]',
      'input[aria-label*="mileage" i]',
      'input[placeholder*="odometer" i]'
    ];

    const mileage = pendingPost.mileage.replace(/[^\d]/g, '');
    return await fillInput(selectors, mileage);
  }

  async function fillVIN() {
    if (!pendingPost.vin) return false;
    
    const selectors = [
      'input[placeholder*="vin" i]',
      'input[aria-label*="vin" i]',
      'input[placeholder*="vehicle identification" i]'
    ];

    return await fillInput(selectors, pendingPost.vin);
  }

  async function fillPrice() {
    if (!pendingPost.price) return false;
    
    const selectors = [
      'input[placeholder*="price" i]',
      'input[aria-label*="price" i]',
      'input[type="number"]',
      'input[inputmode="numeric"]'
    ];

    const price = pendingPost.price.replace(/[^\d]/g, '');
    return await fillInput(selectors, price);
  }

  async function fillTitle() {
    if (!pendingPost.year || !pendingPost.make || !pendingPost.model) return false;
    
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
      console.log('⚠ Description may not have been filled correctly');
      return false;
    }
  }

  async function fillLocation() {
    if (!pendingPost.dealerAddress) return false;
    
    const selectors = [
      'input[placeholder*="location" i]',
      'input[aria-label*="location" i]',
      'input[placeholder*="address" i]'
    ];

    return await fillInput(selectors, pendingPost.dealerAddress);
  }

  async function fillCondition() {
    if (!pendingPost.condition) return false;
    
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

  async function fillTransmission() {
    if (!pendingPost.transmission) return false;
    
    const trans = pendingPost.transmission.toLowerCase();
    const isAutomatic = trans.includes('automatic');
    
    const element = findElementByText([
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
    if (!pendingPost.drivetrain) return false;
    
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

  async function fillFuelType() {
    if (!pendingPost.engine) return false;
    
    const engine = pendingPost.engine.toLowerCase();
    let fuelType = 'Gasoline';
    
    if (engine.includes('diesel')) fuelType = 'Diesel';
    if (engine.includes('electric')) fuelType = 'Electric';
    if (engine.includes('hybrid')) fuelType = 'Hybrid';
    
    const element = findElementByText([fuelType]);
    if (element) {
      simulateClick(element);
      await sleep(500);
      return true;
    }
    return false;
  }

  async function fillExteriorColor() {
    if (!pendingPost.exteriorColor) return false;
    
    const colorInput = document.querySelector('input[placeholder*="exterior" i], input[aria-label*="exterior" i]');
    if (colorInput && isVisible(colorInput)) {
      return await fillInput([colorInput], pendingPost.exteriorColor);
    }
    return false;
  }

  async function fillInteriorColor() {
    if (!pendingPost.interiorColor) return false;
    
    const colorInput = document.querySelector('input[placeholder*="interior" i], input[aria-label*="interior" i]');
    if (colorInput && isVisible(colorInput)) {
      return await fillInput([colorInput], pendingPost.interiorColor);
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

})();
