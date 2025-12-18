// helpers.js
// Utility functions used across the extension

const helpers = {
  
  /**
   * Sleep/delay function
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise}
   */
  sleep: (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Clean and format price
   * @param {string} price - Raw price string
   * @returns {string} Cleaned price (numbers only)
   */
  cleanPrice: (price) => {
    if (!price) return '';
    return price.replace(/[$,]/g, '').trim();
  },

  /**
   * Clean and format mileage
   * @param {string} mileage - Raw mileage string
   * @returns {string} Cleaned mileage (numbers only)
   */
  cleanMileage: (mileage) => {
    if (!mileage) return '';
    return mileage.replace(/[,mi]/gi, '').trim();
  },

  /**
   * Format phone number
   * @param {string} phone - Raw phone number
   * @returns {string} Formatted phone number
   */
  formatPhone: (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    }
    return cleaned;
  },

  /**
   * Validate VIN
   * @param {string} vin - Vehicle VIN
   * @returns {boolean}
   */
  isValidVIN: (vin) => {
    if (!vin) return false;
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
  },

  /**
   * Validate year
   * @param {number|string} year - Vehicle year
   * @returns {boolean}
   */
  isValidYear: (year) => {
    const y = parseInt(year);
    const currentYear = new Date().getFullYear();
    return y >= 1900 && y <= currentYear + 2;
  },

  /**
   * Format currency
   * @param {number|string} amount - Amount to format
   * @returns {string} Formatted currency string
   */
  formatCurrency: (amount) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  },

  /**
   * Format date/time
   * @param {Date|string} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDateTime: (date) => {
    if (!date) return '';
    const d = new Date(date);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  },

  /**
   * Truncate text
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncate: (text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  },

  /**
   * Sanitize HTML
   * @param {string} html - HTML string to sanitize
   * @returns {string} Sanitized text
   */
  sanitizeHTML: (html) => {
    const temp = document.createElement('div');
    temp.textContent = html;
    return temp.innerHTML;
  },

  /**
   * Deep clone object
   * @param {object} obj - Object to clone
   * @returns {object} Cloned object
   */
  deepClone: (obj) => {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Debounce function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in ms
   * @returns {Function} Debounced function
   */
  debounce: (func, wait = 300) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in ms
   * @returns {Function} Throttled function
   */
  throttle: (func, limit = 300) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Get URL parameter
   * @param {string} param - Parameter name
   * @param {string} url - URL to parse (defaults to current)
   * @returns {string|null} Parameter value
   */
  getUrlParam: (param, url = window.location.href) => {
    const urlObj = new URL(url);
    return urlObj.searchParams.get(param);
  },

  /**
   * Check if element is visible
   * @param {HTMLElement} element - Element to check
   * @returns {boolean}
   */
  isVisible: (element) => {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetParent !== null;
  },

  /**
   * Wait for element to appear
   * @param {string} selector - CSS selector
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<HTMLElement>}
   */
  waitForElement: (selector, timeout = 5000) => {
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
  },

  /**
   * Generate unique ID
   * @returns {string} Unique ID
   */
  generateId: () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>}
   */
  copyToClipboard: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Copy failed:', error);
      return false;
    }
  },

  /**
   * Download file
   * @param {string} content - File content
   * @param {string} filename - File name
   * @param {string} mimeType - MIME type
   */
  downloadFile: (content, filename, mimeType = 'text/plain') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Validate email
   * @param {string} email - Email to validate
   * @returns {boolean}
   */
  isValidEmail: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  /**
   * Extract domain from URL
   * @param {string} url - URL string
   * @returns {string} Domain name
   */
  getDomain: (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return '';
    }
  },

  /**
   * Calculate percentage
   * @param {number} value - Current value
   * @param {number} total - Total value
   * @returns {number} Percentage
   */
  percentage: (value, total) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  },

  /**
   * Sort array of objects
   * @param {Array} array - Array to sort
   * @param {string} key - Key to sort by
   * @param {string} order - 'asc' or 'desc'
   * @returns {Array} Sorted array
   */
  sortBy: (array, key, order = 'asc') => {
    return array.sort((a, b) => {
      if (order === 'asc') {
        return a[key] > b[key] ? 1 : -1;
      } else {
        return a[key] < b[key] ? 1 : -1;
      }
    });
  },

  /**
   * Remove duplicates from array
   * @param {Array} array - Array with duplicates
   * @returns {Array} Array without duplicates
   */
  unique: (array) => {
    return [...new Set(array)];
  },

  /**
   * Chunk array into smaller arrays
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array} Array of chunks
   */
  chunk: (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  /**
   * Log with timestamp
   * @param {string} message - Message to log
   * @param {string} level - Log level
   */
  log: (message, level = 'info') => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'error':
        console.error(prefix, message);
        break;
      case 'warn':
        console.warn(prefix, message);
        break;
      case 'debug':
        console.debug(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
  }

};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = helpers;
}
