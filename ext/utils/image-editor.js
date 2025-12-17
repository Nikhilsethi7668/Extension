// image-editor.js
// AI-powered image editing using Gemini API

const ImageEditor = {
  
  /**
   * Edit image using Gemini API
   * @param {string} imageUrl - Original image URL
   * @param {string} prompt - Edit instruction
   * @param {string} userId - User ID
   * @param {string} apiUrl - Backend API URL
   * @param {string} token - Auth token
   * @returns {Promise<Object>} Edited image result
   */
  async editImage(imageUrl, prompt, userId, apiUrl, token) {
    try {
      const response = await fetch(`${apiUrl}/ai/edit-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId,
          imageUrl,
          prompt,
          resolution: '4K',
          format: 'jpeg'
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        return {
          success: true,
          originalUrl: imageUrl,
          editedUrl: data.editedImageUrl,
          prompt: prompt,
          timestamp: new Date().toISOString(),
          storageUrl: data.storageUrl,
          metadata: data.metadata
        };
      } else {
        throw new Error(data.message || 'Image editing failed');
      }
    } catch (error) {
      console.error('Image editing error:', error);
      return {
        success: false,
        error: error.message,
        originalUrl: imageUrl,
        prompt: prompt
      };
    }
  },

  /**
   * Batch edit multiple images
   * @param {Array} images - Array of {url, prompt} objects
   * @param {string} userId - User ID
   * @param {string} apiUrl - Backend API URL
   * @param {string} token - Auth token
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Array>} Array of edit results
   */
  async batchEditImages(images, userId, apiUrl, token, progressCallback = null) {
    const results = [];
    
    for (let i = 0; i < images.length; i++) {
      const { url, prompt } = images[i];
      
      if (progressCallback) {
        progressCallback(i + 1, images.length, url);
      }
      
      const result = await this.editImage(url, prompt, userId, apiUrl, token);
      results.push(result);
      
      // Add delay between requests to avoid rate limiting
      if (i < images.length - 1) {
        await this.sleep(1000);
      }
    }
    
    return results;
  },

  /**
   * Download image as base64
   * @param {string} imageUrl - Image URL
   * @returns {Promise<string>} Base64 encoded image
   */
  async downloadImageAsBase64(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error downloading image:', error);
      throw error;
    }
  },

  /**
   * Resize image
   * @param {string} base64Image - Base64 image
   * @param {number} maxWidth - Maximum width
   * @param {number} maxHeight - Maximum height
   * @returns {Promise<string>} Resized base64 image
   */
  async resizeImage(base64Image, maxWidth = 1920, maxHeight = 1440) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      
      img.onerror = reject;
      img.src = base64Image;
    });
  },

  /**
   * Crop image
   * @param {string} base64Image - Base64 image
   * @param {Object} cropData - {x, y, width, height}
   * @returns {Promise<string>} Cropped base64 image
   */
  async cropImage(base64Image, cropData) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = cropData.width;
        canvas.height = cropData.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          img,
          cropData.x, cropData.y,
          cropData.width, cropData.height,
          0, 0,
          cropData.width, cropData.height
        );
        
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      
      img.onerror = reject;
      img.src = base64Image;
    });
  },

  /**
   * Get suggested edit prompts based on vehicle type
   * @param {string} vehicleType - Type of vehicle
   * @returns {Array<string>} Array of suggested prompts
   */
  getSuggestedPrompts(vehicleType = 'car') {
    const commonPrompts = [
      'Remove background and replace with professional showroom',
      'Remove background and make it pure white',
      'Enhance image brightness and contrast',
      'Remove any watermarks or logos',
      'Make the vehicle stand out more',
      'Add subtle shadows for depth',
      'Clean up any dirt or scratches',
      'Make colors more vibrant',
      'Professional dealership quality enhancement',
      'Studio lighting effect'
    ];

    const vehicleSpecific = {
      car: [
        'Replace background with luxury dealership',
        'Add showroom floor reflection',
        'Premium sedan photography style'
      ],
      truck: [
        'Replace background with rugged outdoor scene',
        'Off-road adventure background',
        'Working truck professional photo'
      ],
      suv: [
        'Family-friendly background',
        'Mountain landscape background',
        'Adventure-ready styling'
      ],
      motorcycle: [
        'Replace background with open road',
        'Studio black background',
        'Dynamic angle enhancement'
      ]
    };

    return [
      ...commonPrompts,
      ...(vehicleSpecific[vehicleType] || [])
    ];
  },

  /**
   * Validate image before editing
   * @param {string} imageUrl - Image URL
   * @returns {Promise<Object>} Validation result
   */
  async validateImage(imageUrl) {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      
      const validation = {
        valid: true,
        errors: [],
        warnings: [],
        metadata: {
          contentType,
          size: parseInt(contentLength),
          url: imageUrl
        }
      };

      // Check content type
      if (!contentType || !contentType.includes('image')) {
        validation.valid = false;
        validation.errors.push('Invalid content type. Must be an image.');
      }

      // Check file size (max 10MB)
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
        validation.valid = false;
        validation.errors.push('Image size exceeds 10MB limit');
      }

      // Check if HTTPS
      if (!imageUrl.startsWith('https://')) {
        validation.warnings.push('Non-HTTPS URL. May cause issues.');
      }

      return validation;
    } catch (error) {
      return {
        valid: false,
        errors: ['Unable to access image URL'],
        metadata: { url: imageUrl }
      };
    }
  },

  /**
   * Preview edit result in modal
   * @param {string} originalUrl - Original image URL
   * @param {string} editedUrl - Edited image URL
   * @param {string} prompt - Edit prompt used
   */
  showPreviewModal(originalUrl, editedUrl, prompt) {
    // Create modal HTML
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <h2>Image Edit Preview</h2>
        <p class="edit-prompt"><strong>Prompt:</strong> ${prompt}</p>
        <div class="image-comparison">
          <div class="image-container">
            <h3>Original</h3>
            <img src="${originalUrl}" alt="Original">
          </div>
          <div class="image-container">
            <h3>Edited</h3>
            <img src="${editedUrl}" alt="Edited">
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-accept">Accept & Use</button>
          <button class="btn-reject">Reject & Try Again</button>
          <button class="btn-close">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add modal styles
    const style = document.createElement('style');
    style.textContent = `
      .image-preview-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
      }
      .modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
      }
      .modal-content {
        position: relative;
        max-width: 900px;
        margin: 50px auto;
        background: white;
        padding: 30px;
        border-radius: 12px;
        max-height: 90vh;
        overflow-y: auto;
      }
      .image-comparison {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin: 20px 0;
      }
      .image-container img {
        width: 100%;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .modal-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin-top: 20px;
      }
    `;
    document.head.appendChild(style);

    // Return promise for user action
    return new Promise((resolve) => {
      modal.querySelector('.btn-accept').onclick = () => {
        document.body.removeChild(modal);
        resolve({ action: 'accept', editedUrl });
      };
      modal.querySelector('.btn-reject').onclick = () => {
        document.body.removeChild(modal);
        resolve({ action: 'reject' });
      };
      modal.querySelector('.btn-close').onclick = () => {
        document.body.removeChild(modal);
        resolve({ action: 'close' });
      };
    });
  },

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageEditor;
}
