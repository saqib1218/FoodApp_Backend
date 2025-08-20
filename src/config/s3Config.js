const AWS = require('aws-sdk');

const isProduction = process.env.NODE_ENV === 'production';

const s3 = new AWS.S3({
  endpoint: isProduction ? undefined : 'http://127.0.0.1:9000', // MinIO for dev
  accessKeyId: process.env.S3_ACCESS_KEY || 'admin',           // MinIO / AWS key
  secretAccessKey: process.env.S3_SECRET_KEY || 'admin123',    // MinIO / AWS secret
  s3ForcePathStyle: !isProduction, // Required for MinIO
  signatureVersion: 'v4'
});

module.exports = s3;
