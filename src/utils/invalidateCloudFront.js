const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');

const s3Client = require('../config/s3Config'); // import S3 client

const cloudfront = new CloudFrontClient({

  credentials: s3Client.config.credentials, // reuse S3 credentials
}); // no region needed, uses default dev config

async function invalidateCloudFront(paths = []) {
  if (!paths.length) return;

  const distributionId = process.env.CLOUDFRONT_DIST_ID;
  const command = new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `${Date.now()}`,
      Paths: {
        Quantity: paths.length,
        Items: paths,
      },
    },
  });

  return cloudfront.send(command);
}

module.exports = { invalidateCloudFront };
