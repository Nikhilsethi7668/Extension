const { ipcRenderer } = require('electron');

// Hardcoded API URL
const API_URL = 'https://api.flashfender.com/api';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const apiTokenInput = document.getElementById('apiToken');
const rememberMeCheckbox = document.getElementById('rememberMe');
const loginBtn = document.getElementById('loginBtn');
const errorMessage = document.getElementById('errorMessage');
const btnText = loginBtn.querySelector('.btn-text');
const btnLoader = loginBtn.querySelector('.btn-loader');

// Initialize - auto-fill credentials if saved
async function init() {
  // Token field starts empty for security
  apiTokenInput.value = '';
  rememberMeCheckbox.checked = false;

  try {
    const credentials = await ipcRenderer.invoke('get-saved-credentials');
    if (credentials.rememberMe && credentials.apiToken) {
      apiTokenInput.value = credentials.apiToken;
      rememberMeCheckbox.checked = true;
    }
  } catch (error) {
    console.error('Failed to load saved credentials:', error);
  }
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  
  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 5000);
}

// Handle login form submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const apiToken = apiTokenInput.value.trim();
  const rememberMe = rememberMeCheckbox.checked;
  
  // Validate inputs
  if (!apiToken) {
    showError('Please enter your API token');
    return;
  }
  
  // Show loading state
  loginBtn.disabled = true;
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-flex';
  errorMessage.style.display = 'none';
  
  try {
    // Validate credentials with API
    const result = await ipcRenderer.invoke('validate-login', {
      apiUrl: API_URL,
      apiToken,
      rememberMe
    });
    
    if (result.success) {
      // Successful login - main process will navigate to dashboard
      console.log('Login successful');
    } else {
      showError(result.message || 'Invalid credentials. Please try again.');
      loginBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoader.style.display = 'none';
    }
  } catch (error) {
    showError('An error occurred during login. Please try again.');
    console.error('Login error:', error);
    loginBtn.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
});

// Initialize
init();
