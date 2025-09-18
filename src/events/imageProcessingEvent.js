const { getChannel } = require('../config/rabbitmqClient');
const logger = require('../config/logger');

async function publishImageProcessingEvent(payload, traceId) {
  const log = logger.withTrace({ traceId }); // create a trace-aware logger
  const queue = process.env.RIWAYAT_MEDIA_QUEUE;

  try {
    const channel = getChannel();
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), { persistent: true });

    log.info({ payload }, `📨 Image processing event sent to queue ${queue}`);
  } catch (err) {
    log.error({ err: err.message }, `❌ Failed to send image processing event to queue ${queue}`);
  }
}

module.exports = { publishImageProcessingEvent };
