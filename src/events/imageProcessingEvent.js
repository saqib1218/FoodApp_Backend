const { getChannel } = require('../config/rabbitmqClient');

async function publishImageProcessingEvent(payload) {
  const queue = 'image_processing_queue';
  try {
    const channel = getChannel();
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), { persistent: true });
    console.log(`📨 Image processing event sent`, payload);
  } catch (err) {
    console.error(`❌ Failed to send image processing event`, err.message);
  }
}

module.exports = { publishImageProcessingEvent };
