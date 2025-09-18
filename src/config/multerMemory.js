const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');

// S3 client
const s3Client = new AWS.S3({ region: process.env.AWS_REGION });

// Multer S3 storage for all files
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.S3_BUCKET,
  key: (req, file, cb) => {
    // Use mediaType from form-data to organize folders
    const mediaType = req.body.mediaType || 'others';
    const mediaId = uuidv4();
    cb(null, `${mediaType}/${mediaId}_${file.originalname}`);
  },
  contentType: (req, file, cb) => cb(null, file.mimetype),
});

// Multer instance
const upload = multer({ storage: s3Storage });

// Export middleware
module.exports = {
  upload, // use upload.single('file') or upload.array('files') in your routes
};
