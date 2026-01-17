const { ipcRenderer } = require('electron');

// Hardcoded API URL
const API_URL = 'http://localhost:5573/api';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const apiTokenInput = document.getElementById('apiToken');
const rememberMeCheckbox = document.getElementById('rememberMe');
const loginBtn = document.getElementById('loginBtn');
const errorMessage = document.getElementById('errorMessage');
const btnText = loginBtn.querySelector('.btn-text');
const btnLoader = loginBtn.querySelector('.btn-loader');

// Initialize - don't auto-fill credentials
async function init() {
  // Token field starts empty for security
  apiTokenInput.value = '';
  rememberMeCheckbox.checked = false;
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
