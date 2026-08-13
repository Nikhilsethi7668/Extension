const { EventEmitter } = require('events');
const axios = require('axios');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

class AutomationEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;

    console.log('=== AUTOMATION ENGINE INITIALIZED ===');
    console.log('Config received:', {
      apiUrl: config.apiUrl,
      hasToken: !!config.apiToken,
      tokenLength: config.apiToken?.length || 0,
      pollingInterval: config.pollingInterval
    });

    this.running = false;
    this.browser = null;
    this.pollingTimer = null;
    this.stats = {
      lastCheck: null,
      vehiclesPosted: 0,
      errors: 0
    };
  }

  updateConfig(newConfig) {
    console.log('Updating configuration...');
    this.config = { ...this.config, ...newConfig };
    console.log('Active Profile ID:', this.config.activeProfileId);
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

    if (!this.config.activeProfileId) {
      console.warn('WARNING: No Chrome Profile selected. Automation might not work correctly.');
      this.emit('status', { running: true, message: 'Warning: No Chrome Profile selected.' });
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
      console.log('=== FETCHING VEHICLES ===');

      const params = {
        status: 'scraped',
        limit: 10
      };

      if (this.config.activeProfileId) {
        params.profileId = this.config.activeProfileId;
      }

      const response = await axios.get(`${this.config.apiUrl}/vehicles`, {
        params: params,
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`
        },
        timeout: 30000
      });

      console.log('Vehicles fetched successfully:', response.data.vehicles?.length || 0);
      return response.data.vehicles || [];
    } catch (error) {
      console.error('=== FETCH VEHICLES ERROR ===');
      console.error('Error message:', error.message);
      throw new Error(`Failed to fetch vehicles: ${error.message}`);
    }
  }

  async postVehicle(vehicle) {
    console.log(`Posting vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);

    // Initialize browser if not already running OR if we need to switch profile?
    // For now, assume one profile active.
    if (!this.browser) {
      await this.initBrowser(this.config.activeProfileId); // Use configured profile
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

      // ⭐ NEW: Generate fresh stealth images for THIS posting
      console.log(`[Posting] Preparing fresh stealth images for profile: ${this.config.activeProfileId || 'default'}...`);
      let freshPreparedImages = null;

      try {
        const prepResponse = await axios.post(
          `${this.config.apiUrl}/vehicles/${vehicle._id}/prepare-for-posting`,
          { profileId: this.config.activeProfileId || 'default' },
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiToken}`
            },
            timeout: 60000 // 60 seconds for image processing
          }
        );

        if (prepResponse.data.success) {
          freshPreparedImages = prepResponse.data.preparedImages;
          console.log(`[Posting] ✅ Generated ${freshPreparedImages.length} fresh stealth images`);
          console.log(`[Posting] Camera: ${prepResponse.data.metadata.camera}`);
          console.log(`[Posting] Folder: ${prepResponse.data.metadata.folder}`);
        } else {
          console.warn('[Posting] ⚠️ Fresh image generation failed, will use existing preparedImages');
        }
      } catch (prepError) {
        console.error('[Posting] ⚠️ Error generating fresh images:', prepError.message);
        console.log('[Posting] Falling back to existing preparedImages');
      }

      // Fetch formatted vehicle data from API
      const vehicleData = await this.fetchVehicleData(vehicle._id);

      // ⭐ Override with freshly generated images if available
      if (freshPreparedImages && freshPreparedImages.length > 0) {
        vehicleData.data.preparedImages = freshPreparedImages;
        console.log(`[Posting] Using ${freshPreparedImages.length} freshly stealthed images`);
      } else {
        console.log(`[Posting] Using ${vehicleData.data.preparedImages?.length || 0} existing prepared images`);
      }

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
      const payload = {
        platform: 'facebook_marketplace',
        action: 'posted_via_automation'
      };

      if (this.config.activeProfileId) {
        payload.profileId = this.config.activeProfileId;
      }

      await axios.post(`${this.config.apiUrl}/vehicles/${vehicleId}/posted`, payload, {
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

  async postSingleVehicle(vehicle, profileDir) {
    if (!vehicle || !profileDir) throw new Error('Missing vehicle or profile');

    console.log(`[Engine] Posting single vehicle ${vehicle._id} with profile ${profileDir}`);

    // Close existing browser if it's running (to switch profiles or ensure clean state)
    // Actually, we might want to keep it if it's the SAME profile, but checking that is complex.
    // For safety, let's close and reopen.
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    try {
      await this.initBrowser(profileDir);

      await this.postVehicle(vehicle); // Reuse existing logic

      // Don't close immediately if we want to show the user? 
      // But automations usually close. Let's close after a delay or just leave it open?
      // User request: "open that browser profile". 
      // If we close it, they can't see it. But `postVehicle` closes the page. 
      // The browser instance is `this.browser`.
      // `postVehicle` calls `page.close()`, not `browser.close()`.

      // However, `postVehicle` logic (line 215) closes the PAGE.
      // The browser remains open in `this.browser`.

      // Let's leave the browser open for a bit or indefinitely?
      // If we leave it open, subsequent calls might reuse it.

    } catch (error) {
      console.error('[Engine] Single post failed:', error);
      throw error;
    }
  }

  async initBrowser(profileDir = null) {
    console.log(`Initializing browser with extension... Profile: ${profileDir || 'Default'}`);

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

    // Get user data directory based on platform
    let userDataDir;
    if (process.platform === 'win32') {
      userDataDir = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
    } else if (process.platform === 'darwin') {
      userDataDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome');
    } else if (process.platform === 'linux') {
      userDataDir = path.join(process.env.HOME, '.config', 'google-chrome');
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }

    this.browser = await puppeteer.launch({
      headless: false, // Must be non-headless for extensions
      executablePath: chromePath,
      userDataDir: userDataDir,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800',
        ...(profileDir ? [`--profile-directory=${profileDir}`] : [])
      ],
      defaultViewport: null
    });

    console.log('Browser initialized successfully');
  }

  findChrome() {
    if (process.platform === 'win32') {
      // Windows paths
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Chromium\\Application\\chrome.exe'
      ];

      for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
          console.log(`Found Chrome at: ${chromePath}`);
          return chromePath;
        }
      }
    } else if (process.platform === 'darwin') {
      // macOS path
      const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (fs.existsSync(macPath)) {
        console.log(`Found Chrome at: ${macPath}`);
        return macPath;
      }
    } else if (process.platform === 'linux') {
      // Linux paths
      const linuxPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
      ];

      for (const chromePath of linuxPaths) {
        if (fs.existsSync(chromePath)) {
          console.log(`Found Chrome at: ${chromePath}`);
          return chromePath;
        }
      }
    }

    console.error(`Chrome not found on ${process.platform}`);
    return null;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutomationEngine;
