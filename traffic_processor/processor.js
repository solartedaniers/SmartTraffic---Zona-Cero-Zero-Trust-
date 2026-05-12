const { Kafka } = require('kafkajs');
const amqp = require('amqplib');
const axios = require('axios');

const AUTH_SERVER = process.env.AUTH_SERVER_URL || 'http://auth_server:5000';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';

// KTable: estado actual por zona (stateful)
const zoneState = {};

async function getToken() {
  let retries = 10;
  while (retries > 0) {
    try {
      const res = await axios.post(`${AUTH_SERVER}/token`, {
        client_id: 'processor-client',
        client_secret: 'processor-secret-456'
      });
      console.log('[PROCESSOR] ✅ Token JWT obtenido');
      return res.data.token;
    } catch {
      console.log(`[PROCESSOR] ⏳ Esperando Auth Server... (${retries})`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('[PROCESSOR] ❌ Sin token');
}

async function connectRabbitMQ() {
  let retries = 15;
  while (retries > 0) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      console.log('[PROCESSOR] ✅ Conectado a RabbitMQ');
      return conn;
    } catch {
      console.log(`[PROCESSOR] ⏳ Esperando RabbitMQ... (${retries})`);
      retries--;
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  throw new Error('[PROCESSOR] ❌ Sin RabbitMQ');
}

async function main() {
  await getToken();

  // Conectar RabbitMQ
  const rabbitConn = await connectRabbitMQ();
  const rabbitChannel = await rabbitConn.createChannel();
  
  // Exchange fanout para broadcast de actualizaciones
  await rabbitChannel.assertExchange('traffic_updates', 'fanout', { durable: true });
  
  // Cola para queries (request-reply)
  await rabbitChannel.assertQueue('query_traffic_queue', { durable: true });

  // Conectar Kafka
  const kafka = new Kafka({ clientId: 'traffic-processor', brokers: KAFKA_BROKERS });
  const consumer = kafka.consumer({ groupId: 'processor-group' });

  let connected = false;
  let retries = 15;
  while (!connected && retries > 0) {
    try {
      await consumer.connect();
      connected = true;
    } catch {
      console.log(`[PROCESSOR] ⏳ Esperando Kafka... (${retries})`);
      retries--;
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  await consumer.subscribe({ topic: 'traffic-events', fromBeginning: false });

  console.log('[PROCESSOR] 🧠 Procesador de tráfico activo...');

  // Responder queries de zonas
  rabbitChannel.consume('query_traffic_queue', async (msg) => {
    if (!msg) return;
    const query = JSON.parse(msg.content.toString());
    console.log(`[PROCESSOR] ❓ Query recibida para zona: ${query.zone_id}`);
    
    const state = zoneState[query.zone_id] || { status: 'SIN_DATOS', vehicles_count: 0 };
    const response = { zone_id: query.zone_id, ...state, query_id: query.query_id };
    
    rabbitChannel.sendToQueue(
      msg.properties.replyTo || 'query_answers',
      Buffer.from(JSON.stringify(response)),
      { correlationId: msg.properties.correlationId }
    );
    rabbitChannel.ack(msg);
  });

  // Consumir eventos de Kafka y actualizar KTable
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const data = JSON.parse(message.value.toString());
      
      // Actualizar KTable (estado por zona)
      zoneState[data.zone_id] = {
        status: data.status,
        vehicles_count: data.vehicles_count,
        last_updated: data.timestamp
      };

      console.log(`[PROCESSOR] 🗺️  KTable actualizado - Zona ${data.zone_id}: ${data.status}`);

      // Publicar estado completo en RabbitMQ (fanout)
      const stateUpdate = {
        type: 'STATE_UPDATE',
        zone_id: data.zone_id,
        status: data.status,
        vehicles_count: data.vehicles_count,
        timestamp: data.timestamp,
        full_state: { ...zoneState }
      };

      rabbitChannel.publish(
        'traffic_updates',
        '',
        Buffer.from(JSON.stringify(stateUpdate))
      );
    }
  });
}

main().catch(err => {
  console.error('[PROCESSOR] ❌ Error fatal:', err.message);
  process.exit(1);
});