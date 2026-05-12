const amqp = require('amqplib');
const axios = require('axios');

const AUTH_SERVER = process.env.AUTH_SERVER_URL || 'http://auth_server:5000';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';

// Mapa local de estado de zonas
const zoneMap = {};

async function getToken() {
  let retries = 10;
  while (retries > 0) {
    try {
      const res = await axios.post(`${AUTH_SERVER}/token`, {
        client_id: 'dispatcher-client',
        client_secret: 'dispatcher-secret-789'
      });
      console.log('[DISPATCHER] ✅ Token JWT obtenido');
      return res.data.token;
    } catch {
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('[DISPATCHER] ❌ Sin token');
}

async function connectRabbitMQ() {
  let retries = 15;
  while (retries > 0) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      console.log('[DISPATCHER] ✅ Conectado a RabbitMQ');
      return conn;
    } catch {
      retries--;
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  throw new Error('[DISPATCHER] ❌ Sin RabbitMQ');
}

async function main() {
  await getToken();
  const conn = await connectRabbitMQ();
  const channel = await conn.createChannel();

  // Suscribirse al fanout de actualizaciones
  await channel.assertExchange('traffic_updates', 'fanout', { durable: true });
  const { queue } = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(queue, 'traffic_updates', '');

  console.log('[DISPATCHER] 🚨 Alert Dispatcher activo, escuchando actualizaciones...');

  channel.consume(queue, (msg) => {
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    
    // Actualizar mapa local
    zoneMap[data.zone_id] = {
      status: data.status,
      vehicles_count: data.vehicles_count,
      timestamp: data.timestamp
    };

    // Generar alerta si es necesario
    if (data.status === 'CONGESTIONADO' || data.status === 'BLOQUEADO') {
      console.log(`[DISPATCHER] 🚨 ALERTA - Zona ${data.zone_id}: ${data.status} (${data.vehicles_count} vehículos)`);
    } else {
      console.log(`[DISPATCHER] ✅ Zona ${data.zone_id}: ${data.status}`);
    }

    channel.ack(msg);
  });
}

main().catch(err => {
  console.error('[DISPATCHER] ❌ Error fatal:', err.message);
  process.exit(1);
});