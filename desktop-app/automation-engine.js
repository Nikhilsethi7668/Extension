const { EventEmitter } = require('events');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

class AutomationEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.running = false;
    this.browser = null;
    this.pollingTimer = null;
    this.stats = {
      lastCheck: null,
      vehiclesPosted: 0,
      errors: 0
    };
  }

  isRunning() {
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      ...this.stats
    };
  }

  async start() {
    if (this.running) {
      console.log('Automation already running');
      return;
    }

    console.log('Starting automation engine...');
    this.running = true;
    this.emit('status', { running: true, message: 'Starting automation...' });

    // Start the polling cycle
    this.scheduleNextCheck(1000); // First check after 1 second
  }

  async stop() {
    console.log('Stopping automation engine...');
    this.running = false;
    
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.emit('status', { running: false, message: 'Automation stopped' });
  }

  scheduleNextCheck(delay = null) {
    if (!this.running) return;

    const waitTime = delay || (this.config.pollingInterval * 60 * 1000);
    
    this.pollingTimer = setTimeout(async () => {
      await this.checkAndPostVehicles();
      this.scheduleNextCheck();
    }, waitTime);
  }

  async checkAndPostVehicles() {
    if (!this.running) return;

    try {
      this.stats.lastCheck = new Date().toISOString();
      this.emit('status', { running: true, message: 'Checking for pending vehicles...' });

      // Fetch pending vehicles from API
      const vehicles = await this.fetchPendingVehicles();

      if (vehicles.length === 0) {
        console.log('No pending vehicles found');
        this.emit('status', { running: true, message: 'No pending vehicles' });
        return;
      }

      console.log(`Found ${vehicles.length} pending vehicle(s)`);
      this.emit('status', { running: true, message: `Posting ${vehicles.length} vehicle(s)...` });

      // Post each vehicle
      for (const vehicle of vehicles) {
        if (!this.running) break; // Stop if user stopped automation

        try {
          await this.postVehicle(vehicle);
          this.stats.vehiclesPosted++;
          this.emit('vehicle-posted', vehicle);
          
          // Wait between posts to avoid detection
          await this.sleep(10000); // 10 seconds between posts
        } catch (error) {
          console.error(`Error posting vehicle ${vehicle._id}:`, error);
          this.stats.errors++;
          this.emit('error', { vehicleId: vehicle._id, message: error.message });
        }
      }

      this.emit('status', { running: true, message: 'Waiting for next check...' });
    } catch (error) {
      console.error('Error in check cycle:', error);
      this.stats.errors++;
      this.emit('error', { message: error.message });
      this.emit('status', { running: true, message: 'Error occurred, will retry...' });
    }
  }

  async fetchPendingVehicles() {
    try {
      const response = await axios.get(`${this.config.apiUrl}/vehicles`, {
        params: {
          status: 'scraped',
          limit: 10 // Process up to 10 vehicles per cycle
        },
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`
        },
        timeout: 30000
      });

      return response.data.vehicles || [];
    } catch (error) {
      console.error('Error fetching vehicles:', error.message);
      throw new Error(`Failed to fetch vehicles: ${error.message}`);
    }
  }

  async postVehicle(vehicle) {
    console.log(`Posting vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);

    // Initialize browser if not already running
    if (!this.browser) {
      await this.initBrowser();
    }

    // Navigate to Facebook Marketplace
    const page = await this.browser.newPage();
    
    try {
      // Set user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Go to Facebook Marketplace create page
      await page.goto('https://www.facebook.com/marketplace/create/vehicle', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Wait for the extension to load
      await this.sleep(3000);

      // Fetch formatted vehicle data from API
      const vehicleData = await this.fetchVehicleData(vehicle._id);

      // Send data to extension via page context
      await page.evaluate((data) => {
        // Store data for extension to pick up
        window.postMessage({
          type: 'FLASH_FENDER_FILL_FORM',
          data: data
        }, '*');
      }, vehicleData.data);

      // Wait for form to be filled and submitted
      // The extension will handle the actual filling
      await this.sleep(5000);

      // Check if we're still on the create page or if posting succeeded
      const currentUrl = page.url();
      
      // Wait for posting to complete (extension will submit the form)
      await page.waitForNavigation({ timeout: 60000, waitUntil: 'networkidle2' }).catch(() => {
        console.log('Navigation timeout, checking manually...');
      });

      // Mark as posted in API
      await this.markVehicleAsPosted(vehicle._id);

      console.log(`Successfully posted vehicle ${vehicle._id}`);
    } catch (error) {
      console.error('Error during posting:', error);
      throw error;
    } finally {
      await page.close();
    }
  }

  async fetchVehicleData(vehicleId) {
    try {
      const response = await axios.get(`${this.config.apiUrl}/vehicles/${vehicleId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch vehicle data: ${error.message}`);
    }
  }

  async markVehicleAsPosted(vehicleId) {
    try {
      await axios.post(`${this.config.apiUrl}/vehicles/${vehicleId}/posted`, {
        platform: 'facebook_marketplace',
        action: 'posted_via_automation'
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`
        },
        timeout: 30000
      });
    } catch (error) {
      console.error('Error marking vehicle as posted:', error.message);
      // Don't throw - the vehicle was posted even if we couldn't update the API
    }
  }

  async initBrowser() {
    console.log('Initializing browser with extension...');

    // Find Chrome executable
    const chromePath = this.findChrome();
    
    if (!chromePath) {
      throw new Error('Chrome/Chromium not found. Please install Google Chrome.');
    }

    // Resolve extension path
    let extensionPath = this.config.extensionPath;
    if (!extensionPath) {
      // Default to parent directory's extension folder
      extensionPath = path.join(__dirname, '..', 'extension');
    }

    if (!fs.existsSync(extensionPath)) {
      throw new Error(`Extension not found at: ${extensionPath}`);
    }

    console.log(`Loading extension from: ${extensionPath}`);

    this.browser = await puppeteer.launch({
      headless: false, // Must be non-headless for extensions
      executablePath: chromePath,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800'
      ],
      defaultViewport: null
    });

    console.log('Browser initialized successfully');
  }

  findChrome() {
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Chromium\\Application\\chrome.exe'
    ];

    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }

    return null;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutomationEngine;
