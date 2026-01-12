import mongoose from 'mongoose';

const chromeProfileSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uniqueId: {
    type: String,
    required: true,
    // unique per user ideally, but composite index easier
  },
  name: {
    type: String,
    required: true
  },
  shortcutName: {
    type: String
  },
  avatarIcon: {
    type: String
  },
  lastSynced: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Composite unique index to allow multiple users to have same profile IDs (though unlikely to overlap, good practice)
chromeProfileSchema.index({ user: 1, uniqueId: 1 }, { unique: true });

const ChromeProfile = mongoose.model('ChromeProfile', chromeProfileSchema);

export default ChromeProfile;
