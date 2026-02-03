import express from 'express';
import mongoose from 'mongoose';
import ChromeProfile from '../models/ChromeProfile.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/chrome-profiles/add
 * @desc    Add a single Chrome profile for the authenticated user
 * @access  Private
 */
router.post('/add', protect, async (req, res) => {
  try {
    const profile = req.body; // Expecting single profile object { id, name, shortcut_name, avatar_icon }
    
    if (!profile || !profile.id || !profile.name) {
      return res.status(400).json({ message: 'Invalid data. ID and Name are required.' });
    }

    // Upsert single profile
    await ChromeProfile.findOneAndUpdate(
      { user: req.user._id, uniqueId: profile.id },
      {
        $set: {
          name: profile.name,
          shortcutName: profile.shortcut_name,
          avatarIcon: profile.avatar_icon,
          lastSynced: new Date()
        }
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: `Added profile: ${profile.name}` });
  } catch (error) {
    console.error('Error adding Chrome profile:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

/**
 * @route   GET /api/chrome-profiles
 * @desc    Get all synced profiles for the user
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const { ids } = req.query;
    const query = { user: req.user._id };

    if (ids) {
        const idList = ids.split(',');
        query.uniqueId = { $in: idList };
    }

    const profiles = await ChromeProfile.find(query).sort({ name: 1 });
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   DELETE /api/chrome-profiles/:id
 * @desc    Delete a profile
 * @access  Private
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    let profile;
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);

    // Try to delete by _id if it's a valid ObjectId
    if (isObjectId) {
        profile = await ChromeProfile.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    }
    
    // If not found by _id (or not an ObjectId), try uniqueId
    if (!profile) {
       profile = await ChromeProfile.findOneAndDelete({ uniqueId: req.params.id, user: req.user._id });
    }

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json({ success: true, message: 'Profile removed' });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

export default router;
