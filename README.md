# Flash Fender - Vehicle Listing Automation

A full-stack solution for automating vehicle listings on Facebook Marketplace, including a Chrome Extension, React Dashboard, and Node.js/Express API.

## Project Structure

- **`api/`**: Backend API (Node.js/Express/MongoDB)
    - Authentication, Vehicle Inventory, AI Generation, Scraping Service.
- **`dashboard/`**: Admin Dashboard (React/Vite)
    - Manage inventory, users, organization settings.
- **`extension/`**: Chrome Extension (Manifest V3)
    - "Flash Fender" - Sidebar extension for scraping and autofilling on Facebook.
- **`docs/`**: Project documentation (Legacy and Deployment guides).

## Getting Started

### 1. Backend API
```bash
cd api
cp .env.example .env
npm install
npm run dev
```
Runs on `http://localhost:5001`.

### 2. Dashboard
```bash
cd dashboard
npm install
npm run dev
```
Runs on `http://localhost:5173`.

### 3. Chrome Extension
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `extension/` folder in this project.

## Features
- **Scraping**: Auto-scrape from Autotrader, Cars.com, CarGurus.
- **AI**: Generate descriptions using Google Gemini.
- **Management**: Multi-user/Multi-org support with Admin roles.
- **Automation**: Autofill Facebook Marketplace listing forms.

## Documentation
See `QUICK_START.md` for detailed usage instructions.
