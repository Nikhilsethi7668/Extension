// browser-metadata.js
// Captures browser profile metadata and user identity information

const BrowserMetadata = {
  
  /**
   * Capture comprehensive browser metadata
   * @returns {Promise<Object>} Browser metadata object
   */
  async capture() {
    const metadata = {
      timestamp: new Date().toISOString(),
      browser: await this.getBrowserInfo(),
      profile: await this.getProfileInfo(),
      system: await this.getSystemInfo(),
      extension: await this.getExtensionInfo(),
      network: await this.getNetworkInfo()
    };

    return metadata;
  },

  /**
   * Get browser information
   * @returns {Object} Browser details
   */
  async getBrowserInfo() {
    const userAgent = navigator.userAgent;
    const browserInfo = {
      userAgent: userAgent,
      vendor: navigator.vendor,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages,
      onLine: navigator.onLine,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack
    };

    // Parse browser version
    const match = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      browserInfo.chromeVersion = match[1];
    }

    return browserInfo;
  },

  /**
   * Get Chrome profile information
   * @returns {Promise<Object>} Profile details
   */
  async getProfileInfo() {
    const profileInfo = {
      profileId: null,
      profileName: null,
      email: null,
      isSignedIn: false
    };

    try {
      // Get Chrome identity
      if (chrome.identity && chrome.identity.getProfileUserInfo) {
        const userInfo = await chrome.identity.getProfileUserInfo();
        profileInfo.email = userInfo.email;
        profileInfo.profileId = userInfo.id;
        profileInfo.isSignedIn = !!userInfo.email;
      }

      // Get management info for profile name
      if (chrome.management && chrome.management.getSelf) {
        const selfInfo = await chrome.management.getSelf();
        profileInfo.extensionId = selfInfo.id;
        profileInfo.extensionVersion = selfInfo.version;
      }

      // Generate unique browser fingerprint
      profileInfo.fingerprint = await this.generateFingerprint();

    } catch (error) {
      console.error('Error getting profile info:', error);
    }

    return profileInfo;
  },

  /**
   * Get system information
   * @returns {Promise<Object>} System details
   */
  async getSystemInfo() {
    const systemInfo = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth
      },
      memory: navigator.deviceMemory || 'unknown',
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown'
    };

    try {
      // Get CPU info
      if (chrome.system && chrome.system.cpu) {
        const cpuInfo = await chrome.system.cpu.getInfo();
        systemInfo.cpu = {
          processors: cpuInfo.processors.length,
          archName: cpuInfo.archName,
          modelName: cpuInfo.modelName
        };
      }

      // Get display info
      if (chrome.system && chrome.system.display) {
        const displays = await chrome.system.display.getInfo();
        systemInfo.displays = displays.map(d => ({
          id: d.id,
          width: d.bounds.width,
          height: d.bounds.height,
          dpi: d.dpiX
        }));
      }
    } catch (error) {
      console.error('Error getting system info:', error);
    }

    return systemInfo;
  },

  /**
   * Get extension information
   * @returns {Promise<Object>} Extension details
   */
  async getExtensionInfo() {
    const extensionInfo = {
      id: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
      installType: 'unknown'
    };

    try {
      if (chrome.management && chrome.management.getSelf) {
        const selfInfo = await chrome.management.getSelf();
        extensionInfo.installType = selfInfo.installType;
        extensionInfo.enabled = selfInfo.enabled;
      }
    } catch (error) {
      console.error('Error getting extension info:', error);
    }

    return extensionInfo;
  },

  /**
   * Get network information
   * @returns {Object} Network details
   */
  async getNetworkInfo() {
    const networkInfo = {
      effectiveType: 'unknown',
      downlink: 'unknown',
      rtt: 'unknown',
      saveData: false
    };

    if ('connection' in navigator) {
      const conn = navigator.connection;
      networkInfo.effectiveType = conn.effectiveType;
      networkInfo.downlink = conn.downlink;
      networkInfo.rtt = conn.rtt;
      networkInfo.saveData = conn.saveData;
    }

    return networkInfo;
  },

  /**
   * Generate unique browser fingerprint
   * @returns {Promise<string>} Fingerprint hash
   */
  async generateFingerprint() {
    const components = [
      navigator.userAgent,
      navigator.language,
      window.screen.width,
      window.screen.height,
      window.screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency,
      navigator.deviceMemory
    ];

    const fingerprint = components.join('|');
    
    // Generate hash
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex.substring(0, 16); // First 16 chars
  },

  /**
   * Get Facebook profile information from active tab
   * @returns {Promise<Object>} Facebook profile details
   */
  async getFacebookProfile() {
    const fbProfile = {
      profileName: null,
      profileId: null,
      profileUrl: null,
      isLoggedIn: false
    };

    try {
      // Query active tab for Facebook profile
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('facebook.com')) {
        // Send message to content script to extract profile info
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'getFacebookProfile'
        });

        if (response && response.success) {
          fbProfile.profileName = response.profileName;
          fbProfile.profileId = response.profileId;
          fbProfile.profileUrl = response.profileUrl;
          fbProfile.isLoggedIn = true;
        }
      }
    } catch (error) {
      console.error('Error getting Facebook profile:', error);
    }

    return fbProfile;
  },

  /**
   * Create comprehensive logging payload
   * @param {string} userId - User ID
   * @param {string} action - Action type
   * @param {Object} vehicleData - Vehicle data
   * @param {Object} additionalData - Additional data
   * @returns {Promise<Object>} Complete logging payload
   */
  async createLoggingPayload(userId, action, vehicleData = {}, additionalData = {}) {
    const metadata = await this.capture();
    const fbProfile = await this.getFacebookProfile();

    const payload = {
      // User Identity
      user_id: userId,
      fb_profile_name: fbProfile.profileName,
      fb_profile_id: fbProfile.profileId,
      fb_profile_url: fbProfile.profileUrl,
      
      // Action Details
      action: action,
      timestamp: metadata.timestamp,
      timezone: metadata.system.timezone,
      
      // Vehicle Data
      vehicle_vin: vehicleData.vin || null,
      vehicle_year: vehicleData.year || null,
      vehicle_make: vehicleData.make || null,
      vehicle_model: vehicleData.model || null,
      vehicle_price: vehicleData.price || null,
      listing_url: additionalData.listingUrl || null,
      
      // Image Information
      image_count: vehicleData.images ? vehicleData.images.length : 0,
      image_urls: vehicleData.images || [],
      image_edit_prompts: additionalData.imageEditPrompts || [],
      edited_image_urls: additionalData.editedImageUrls || [],
      
      // Browser Metadata
      browser_fingerprint: metadata.profile.fingerprint,
      browser_version: metadata.browser.chromeVersion,
      extension_version: metadata.extension.version,
      extension_id: metadata.extension.id,
      
      // System Metadata
      platform: metadata.browser.platform,
      screen_resolution: `${metadata.system.screen.width}x${metadata.system.screen.height}`,
      cpu_cores: metadata.system.cpu?.processors || 'unknown',
      memory: metadata.system.memory,
      
      // Network Metadata
      network_type: metadata.network.effectiveType,
      network_downlink: metadata.network.downlink,
      
      // Additional Context
      session_id: additionalData.sessionId || this.generateSessionId(),
      ip_address: additionalData.ipAddress || null,
      geolocation: additionalData.geolocation || null,
      
      // Configuration Used
      posting_config: additionalData.config || {},
      ai_description_used: additionalData.aiDescriptionUsed || false,
      ai_model: additionalData.aiModel || null,
      
      // Success/Failure
      success: additionalData.success !== false,
      error_message: additionalData.errorMessage || null,
      retry_count: additionalData.retryCount || 0
    };

    return payload;
  },

  /**
   * Generate session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Store metadata locally for offline logging
   * @param {Object} payload - Logging payload
   */
  async storeOffline(payload) {
    try {
      const stored = await chrome.storage.local.get(['offlineLogs']);
      const offlineLogs = stored.offlineLogs || [];
      
      offlineLogs.push(payload);
      
      // Keep only last 100 logs
      if (offlineLogs.length > 100) {
        offlineLogs.shift();
      }
      
      await chrome.storage.local.set({ offlineLogs });
    } catch (error) {
      console.error('Error storing offline log:', error);
    }
  },

  /**
   * Sync offline logs to backend
   * @param {string} apiUrl - Backend API URL
   * @param {string} token - Auth token
   */
  async syncOfflineLogs(apiUrl, token) {
    try {
      const stored = await chrome.storage.local.get(['offlineLogs']);
      const offlineLogs = stored.offlineLogs || [];
      
      if (offlineLogs.length === 0) return;
      
      // Send all offline logs
      for (const log of offlineLogs) {
        await fetch(`${apiUrl}/logs/activity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(log)
        });
      }
      
      // Clear offline logs after successful sync
      await chrome.storage.local.set({ offlineLogs: [] });
      console.log(`Synced ${offlineLogs.length} offline logs`);
      
    } catch (error) {
      console.error('Error syncing offline logs:', error);
    }
  }

};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserMetadata;
}
