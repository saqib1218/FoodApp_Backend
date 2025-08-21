const amqp = require('amqplib');

let channel;

async function connectRabbitMQ() {
  try {
    // Connect to RabbitMQ server
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');

    // Create a channel
    channel = await connection.createChannel();

    console.log('RabbitMQ connected');

    return channel;
  } catch (err) {
    console.error('RabbitMQ connection error:', err);
    process.exit(1);
  }
}

function getChannel() {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  return channel;
}

module.exports = { connectRabbitMQ, getChannel };
