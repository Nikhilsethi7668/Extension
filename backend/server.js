// server.js
// AutoBridge Backend API for Facebook Marketplace Listing System

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const multer = require('multer');
const axios = require('axios');
const sharp = require('sharp');

// App setup
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Firebase Admin initialization
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Upload config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

async function requireAdmin(req, res, next) {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: 'Not authenticated' });
  const userDoc = await db.collection('users').doc(req.user.userId).get();
  if (!userDoc.exists || userDoc.data().role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

async function logActivity(payload) {
  try {
    const entry = {
      user_id: payload.user_id || payload.userId || 'unknown',
      fb_profile_name: payload.fb_profile_name,
      vehicle_vin: payload.vehicle_vin,
      listing_url: payload.listing_url,
      image_edit_prompts: payload.image_edit_prompts || [],
      action: payload.action,
      success: payload.success !== false,
      details: payload.details || {},
      browserMetadata: payload.browserMetadata || {},
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('activity_logs').add(entry);
  } catch (err) {
    console.error('Activity logging error:', err);
  }
}

// ============ Auth Routes ============

// Initial setup endpoint - remove after creating first admin
app.post('/api/auth/setup-admin', async (req, res) => {
  try {
    const { userId, email, password } = req.body;
    if (!userId || !password || !email) return res.status(400).json({ success: false, message: 'Missing fields' });

    const existing = await db.collection('users').doc(userId).get();
    if (existing.exists) return res.status(400).json({ success: false, message: 'User exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    await db.collection('users').doc(userId).set({
      email,
      passwordHash,
      role: 'admin',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      postCount: 0
    });

    const token = jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, message: 'Admin created successfully' });
  } catch (err) {
    console.error('Setup admin error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, email, password, role = 'user' } = req.body;
    if (!userId || !password || !email) return res.status(400).json({ success: false, message: 'Missing fields' });

    const existing = await db.collection('users').doc(userId).get();
    if (existing.exists) return res.status(400).json({ success: false, message: 'User exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    await db.collection('users').doc(userId).set({
      email,
      passwordHash,
      role,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      postCount: 0
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) return res.status(400).json({ success: false, message: 'Missing credentials' });

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const data = userDoc.data();
    if (data.status !== 'active') return res.status(403).json({ success: false, message: 'Account inactive' });

    const ok = await bcrypt.compare(password, data.passwordHash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign({ userId, role: data.role || 'user' }, JWT_SECRET, { expiresIn: '24h' });
    await db.collection('users').doc(userId).update({ lastLogin: admin.firestore.FieldValue.serverTimestamp() });
    await logActivity({ user_id: userId, action: 'login', success: true });

    res.json({ success: true, token, userId, role: data.role || 'user' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/validate', authenticateToken, (req, res) => {
  res.json({ success: true, userId: req.user.userId, role: req.user.role });
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await logActivity({ user_id: req.user.userId, action: 'logout', success: true });
  res.json({ success: true });
});

// ============ Users (Admin) ============

app.get('/api/users', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() }));
    res.json({ success: true, users });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.patch('/api/users/:userId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    if (!['active', 'inactive', 'suspended'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    await db.collection('users').doc(userId).update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ Activity Logs ============

app.post('/api/logs/activity', authenticateToken, async (req, res) => {
  try {
    await logActivity({ ...req.body, user_id: req.body.user_id || req.user.userId });
    res.json({ success: true });
  } catch (err) {
    console.error('Activity log error:', err);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

app.get('/api/logs/activity', authenticateToken, async (req, res) => {
  try {
    const { userId, limit = 100 } = req.query;
    let query = db.collection('activity_logs').orderBy('timestamp', 'desc').limit(parseInt(limit, 10));
    if (req.user.role !== 'admin') {
      query = query.where('user_id', '==', req.user.userId);
    } else if (userId) {
      query = query.where('user_id', '==', userId);
    }
    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp?.toDate() }));
    res.json({ success: true, logs });
  } catch (err) {
    console.error('Fetch logs error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ============ AI Description Generation ============

app.post('/api/ai/generate-description', authenticateToken, async (req, res) => {
  try {
    const { vehicleData = {}, instructions = '', options = {} } = req.body;
    const description = await generateDescriptionWithAI(vehicleData, instructions, options);
    await logActivity({ user_id: req.user.userId, action: 'ai_description_generated', details: { vehicle: `${vehicleData.year || ''} ${vehicleData.make || ''} ${vehicleData.model || ''}` } });
    res.json({ success: true, description });
  } catch (err) {
    console.error('Generate description error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate description' });
  }
});

// ============ AI Image Editing ============

app.post('/api/ai/edit-image', authenticateToken, upload.none(), async (req, res) => {
  try {
    const { imageUrl, prompt, resolution = '4K', format = 'jpeg' } = req.body;
    if (!imageUrl || !prompt) return res.status(400).json({ success: false, message: 'Image URL and prompt required' });

    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const originalImage = Buffer.from(imageResponse.data);

    const editedBuffer = await editImageWithGemini(originalImage, prompt, resolution);
    const editedFileName = `edited/${req.user.userId}/${Date.now()}_edited.jpg`;
    const editedFile = bucket.file(editedFileName);
    await editedFile.save(editedBuffer, { metadata: { contentType: 'image/jpeg', metadata: { prompt } } });

    const [editedSignedUrl] = await editedFile.getSignedUrl({ action: 'read', expires: Date.now() + 30 * 24 * 60 * 60 * 1000 });

    await logActivity({
      user_id: req.user.userId,
      action: 'image_edited',
      image_edit_prompts: [prompt],
      details: { originalUrl: imageUrl, editedUrl: editedSignedUrl }
    });

    res.json({ success: true, editedImageUrl: editedSignedUrl, storagePath: editedFileName, format, resolution });
  } catch (err) {
    console.error('Image edit error:', err);
    res.status(500).json({ success: false, message: err.message || 'Image editing failed' });
  }
});

app.post('/api/ai/batch-edit-images', authenticateToken, async (req, res) => {
  try {
    const { images = [] } = req.body; // [{url, prompt}]
    if (!images.length) return res.status(400).json({ success: false, message: 'No images provided' });

    const results = [];
    for (const img of images) {
      try {
        const imageResponse = await axios.get(img.url, { responseType: 'arraybuffer' });
        const originalImage = Buffer.from(imageResponse.data);
        const editedBuffer = await editImageWithGemini(originalImage, img.prompt, '4K');

        const editedFileName = `edited/${req.user.userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const editedFile = bucket.file(editedFileName);
        await editedFile.save(editedBuffer, { metadata: { contentType: 'image/jpeg', metadata: { prompt: img.prompt } } });
        const [editedSignedUrl] = await editedFile.getSignedUrl({ action: 'read', expires: Date.now() + 30 * 24 * 60 * 60 * 1000 });
        results.push({ success: true, originalUrl: img.url, editedUrl: editedSignedUrl, prompt: img.prompt });
      } catch (err) {
        results.push({ success: false, originalUrl: img.url, error: err.message });
      }
    }

    await logActivity({ user_id: req.user.userId, action: 'batch_image_edit', image_edit_prompts: images.map(i => i.prompt), details: { count: images.length } });
    res.json({ success: true, results });
  } catch (err) {
    console.error('Batch edit error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============ Helpers ============

async function generateDescriptionWithAI(vehicleData, instructions, options) {
  if (process.env.GEMINI_API_KEY) {
    return await generateWithGemini(vehicleData, instructions, options);
  }
  if (process.env.OPENAI_API_KEY) {
    return await generateWithOpenAI(vehicleData, instructions, options);
  }
  return generateDescription(vehicleData, instructions, options);
}

async function generateWithGemini(vehicleData, instructions, options) {
  try {
    const prompt = `Write a compelling vehicle listing description for a ${vehicleData.year || ''} ${vehicleData.make || ''} ${vehicleData.model || ''}.

Price: ${vehicleData.price || 'N/A'}
Mileage: ${vehicleData.mileage || 'N/A'} miles
VIN: ${vehicleData.vin || 'N/A'}
Exterior Color: ${vehicleData.exteriorColor || 'N/A'}
Transmission: ${vehicleData.transmission || 'N/A'}
Drivetrain: ${vehicleData.drivetrain || 'N/A'}

Additional Instructions: ${instructions || 'Make it professional and engaging.'}
${options.includeMileage ? 'Highlight mileage.' : ''}
${options.includeDealerInfo ? 'Include dealer info if available.' : ''}`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
    throw new Error('No content from Gemini');
  } catch (err) {
    console.error('Gemini desc error:', err);
    return generateDescription(vehicleData, instructions, options);
  }
}

async function generateWithOpenAI(vehicleData, instructions, options) {
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Write a compelling vehicle listing description for a ${vehicleData.year || ''} ${vehicleData.make || ''} ${vehicleData.model || ''}. ${instructions || ''}`;
    const completion = await openai.chat.completions.create({ model: 'gpt-4', messages: [{ role: 'user', content: prompt }], max_tokens: 400 });
    return completion.choices[0].message.content;
  } catch (err) {
    console.error('OpenAI desc error:', err);
    return generateDescription(vehicleData, instructions, options);
  }
}

async function editImageWithGemini(imageBuffer, prompt, resolution = '4K') {
  try {
    const base64Image = imageBuffer.toString('base64');
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [
            { text: `Edit this vehicle photo: ${prompt}. Return high-quality ${resolution} image.` },
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
          ]
        }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const editedBase64 = response.data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data;
    if (editedBase64) return Buffer.from(editedBase64, 'base64');
    return await processImageWithSharp(imageBuffer, prompt);
  } catch (err) {
    console.error('Gemini image error:', err);
    return await processImageWithSharp(imageBuffer, prompt);
  }
}

async function processImageWithSharp(imageBuffer, prompt) {
  let processed = sharp(imageBuffer);
  const lower = (prompt || '').toLowerCase();

  if (lower.includes('remove background') || lower.includes('white background')) {
    processed = processed.flatten({ background: { r: 255, g: 255, b: 255 } });
  }
  if (lower.includes('enhance') || lower.includes('brightness')) {
    processed = processed.modulate({ brightness: 1.1, saturation: 1.15 });
  }
  if (lower.includes('contrast')) {
    processed = processed.linear(1.1, -20);
  }
  if (lower.includes('sharpen')) {
    processed = processed.sharpen();
  }

  processed = processed.resize(3840, 2160, { fit: 'inside', withoutEnlargement: true });
  return processed.jpeg({ quality: 92 }).toBuffer();
}

function generateDescription(vehicleData, instructions, options) {
  let desc = `Check out this ${vehicleData.year || ''} ${vehicleData.make || ''} ${vehicleData.model || ''}!`;
  if (vehicleData.trim) desc += `\nTrim: ${vehicleData.trim}`;
  if (options.includeMileage && vehicleData.mileage) desc += `\nMileage: ${vehicleData.mileage} miles`;
  if (vehicleData.exteriorColor) desc += `\nExterior Color: ${vehicleData.exteriorColor}`;
  if (vehicleData.transmission) desc += `\nTransmission: ${vehicleData.transmission}`;
  if (vehicleData.drivetrain) desc += `\nDrivetrain: ${vehicleData.drivetrain}`;
  if (options.includeDealerInfo && vehicleData.dealerName) desc += `\nDealer: ${vehicleData.dealerName}`;
  if (vehicleData.dealerPhone) desc += `\nContact: ${vehicleData.dealerPhone}`;
  if (instructions) desc += `\n${instructions}`;
  return desc;
}

// ============ Start Server ============

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
