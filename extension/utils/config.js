// config.js
// Global configuration for the extension

// config.js
// Global configuration for the extension

var CONFIG = {
  // Extension Information
  name: 'Vehicle Scraper & FB Marketplace Auto-Lister',
  version: '1.0.0',
  
  // Backend URL
  backendUrl: 'https://api.flashfender.com/api',

  // Supported Sites
  supportedSites: [
    {
      name: 'Autotrader',
      domain: 'autotrader.com',
      patterns: [
        'https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml*',
        'https://www.autotrader.com/vehicledetails/*'
      ],
      scraper: 'autotrader'
    },
    {
      name: 'Cars.com',
      domain: 'cars.com',
      patterns: ['https://www.cars.com/vehicledetail/*'],
      scraper: 'cars'
    },
    {
      name: 'CarGurus',
      domain: 'cargurus.com',
      patterns: ['https://www.cargurus.com/Cars/inventorylisting/*'],
      scraper: 'cargurus'
    }
  ],

  // Facebook Marketplace URLs
  facebook: {
    marketplace: 'https://www.facebook.com/marketplace',
    createVehicle: 'https://www.facebook.com/marketplace/create/vehicle',
    yourListings: 'https://www.facebook.com/marketplace/you/selling'
  },

  // Auto-fill Configuration
  autofill: {
    maxAttempts: 30,
    attemptDelay: 2000,
    fillDelay: 300,
    clickDelay: 500,
    imageUploadDelay: 1000
  },

  // Image Settings
  images: {
    maxCount: 24, // Facebook limit
    maxSizeKB: 8192, // 8MB
    preferredFormats: ['jpg', 'jpeg', 'png', 'webp'],
    resolutions: {
      small: { width: 640, height: 480 },
      medium: { width: 1280, height: 960 },
      large: { width: 1920, height: 1440 }
    }
  },

  // AI Configuration
  ai: {
    defaultModel: 'gpt-4',
    maxTokens: 500,
    temperature: 0.7,
    defaultInstructions: 'Write an engaging and professional vehicle listing description that highlights key features and appeals to potential buyers.'
  },

  // Queue Settings
  queue: {
    maxItems: 50,
    postDelay: 3000, // Delay between batch posts (ms)
    autoSave: true
  },

  // Session Settings
  session: {
    tokenExpiry: '24h',
    validateInterval: 30 * 60 * 1000, // 30 minutes
    rememberMe: true
  },

  // Logging Settings
  logging: {
    enabled: true,
    level: 'info', // 'debug', 'info', 'warn', 'error'
    maxEntries: 100
  },

  // Error Messages
  errors: {
    scrapeNoData: 'Could not extract vehicle data from this page',
    scrapeFailed: 'Failed to scrape vehicle data',
    notSupportedSite: 'This website is not supported for scraping',
    postFailed: 'Failed to post to Facebook Marketplace',
    loginRequired: 'Please log in to continue',
    sessionExpired: 'Your session has expired. Please log in again',
    networkError: 'Network error. Please check your connection',
    invalidCredentials: 'Invalid user ID or password',
    accountInactive: 'Your account is not active. Contact administrator'
  },

  // Success Messages
  success: {
    scrapeComplete: 'Vehicle data scraped successfully',
    postComplete: 'Vehicle posted to Facebook Marketplace',
    addedToQueue: 'Added to posting queue',
    loginSuccess: 'Login successful',
    descriptionGenerated: 'Description generated successfully'
  },

  // Vehicle Categories with Emojis
  categories: [
    { value: 'car', label: 'Car', emoji: '🚗' },
    { value: 'truck', label: 'Truck', emoji: '🚙' },
    { value: 'suv', label: 'SUV', emoji: '🚐' },
    { value: 'van', label: 'Van', emoji: '🚚' },
    { value: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' }
  ],

  // Emoji Styles
  emojiStyles: [
    { value: 'none', label: 'None' },
    { value: 'sparkle', label: 'Sparkle', emoji: '✨' },
    { value: 'fire', label: 'Fire', emoji: '🔥' },
    { value: 'star', label: 'Star', emoji: '⭐' },
    { value: 'checkmark', label: 'Checkmark', emoji: '✅' }
  ],

  // Posting Options
  postingOptions: [
    { value: 'marketplace', label: 'Marketplace Only' },
    { value: 'marketplace_groups', label: 'Marketplace + Groups' },
    { value: 'groups', label: 'Groups Only' }
  ],

  // Distance Options (miles)
  distanceOptions: [20, 40, 60, 80, 100, 150],

  // Field Validation Rules
  validation: {
    year: {
      min: 1900,
      max: new Date().getFullYear() + 2
    },
    mileage: {
      min: 0,
      max: 999999
    },
    price: {
      min: 0,
      max: 10000000
    },
    vin: {
      length: 17,
      pattern: /^[A-HJ-NPR-Z0-9]{17}$/
    }
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
