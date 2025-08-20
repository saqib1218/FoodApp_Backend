const express = require('express');
const router = express.Router();
const multer = require('multer');

// Configure multer for file uploads with restrictions
const upload = multer({
  dest: 'tmp/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 1 // Only allow 1 file at a time
  },
  fileFilter: (req, file, cb) => {
    // Only allow image, video, and audio files
    const allowedMimeTypes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      // Videos
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm',
      // Audio
      'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg', 'audio/mpeg'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only image, video, and audio files are allowed.`), false);
    }
  }
});

const { authenticateToken } = require('../middleware/auth');
const kitchenController = require('../controllers/kitchen');

// Route: Owner invites a chef
router.post('/invitations', authenticateToken, kitchenController.createChefInvitation);

// Route: Create Kitchen
router.post('/create', authenticateToken, kitchenController.createKitchen);

// Route: Add Kitchen Address
router.post('/address', authenticateToken, kitchenController.addKitchenAddress);

// Route: Update Kitchen Availability
// ✅ kitchenId is now a path param
router.put('/:kitchenId/availability', authenticateToken, kitchenController.updateKitchenAvailability);


// Route: Upload Kitchen Media (Binary files only - no URLs or JSON)
router.post('/:kitchenId/media', authenticateToken, upload.single('file'), kitchenController.processMedia);


module.exports = router;
