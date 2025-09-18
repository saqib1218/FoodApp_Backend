const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');


const QUEUE_URL = process.env.SQS_QUEUE_URL;

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION, // must be set in your .env
  credentials: {
  accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  },
});

async function poll() {
  while (true) {
    const data = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 60,
      })
    );

    if (data.Messages) {
      for (const msg of data.Messages) {
        console.log('📥 Received message', msg.Body);

        // process here…

        // delete (ack)
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: msg.ReceiptHandle,
          })
        );
      }
    }
  }
}

poll().catch(console.error);
module.exports={sqsClient};
