import express from 'express';
import ChromeProfile from '../models/ChromeProfile.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/chrome-profiles/sync
 * @desc    Sync Chrome profiles for the authenticated user
 * @access  Private
 */
router.post('/sync', protect, async (req, res) => {
  try {
    const profiles = req.body.profiles; // Expecting array of { id, name, shortcut_name, avatar_icon }
    
    if (!profiles || !Array.isArray(profiles)) {
      return res.status(400).json({ message: 'Invalid data format. Expected an array of profiles.' });
    }

    const operations = profiles.map(profile => ({
      updateOne: {
        filter: { user: req.user._id, uniqueId: profile.id },
        update: {
          $set: {
            name: profile.name,
            shortcutName: profile.shortcut_name,
            avatarIcon: profile.avatar_icon,
            lastSynced: new Date()
          }
        },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await ChromeProfile.bulkWrite(operations);
    }

    res.json({ success: true, message: `Synced ${profiles.length} profiles.` });
  } catch (error) {
    console.error('Error syncing Chrome profiles:', error);
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
    const profiles = await ChromeProfile.find({ user: req.user._id }).sort({ name: 1 });
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
    // Try to delete by _id first, then uniqueId if not found or invalid format
    let profile = await ChromeProfile.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    
    if (!profile) {
      // Try uniqueId
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
