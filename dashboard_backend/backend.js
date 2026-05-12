const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const amqp = require('amqplib');
const axios = require('axios');
const path = require('path');

const AUTH_SERVER = process.env.AUTH_SERVER_URL || 'http://auth_server:5000';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';

const app = express();

// Servir archivos estáticos desde /app/public
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Ruta raíz explícita
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const wsClients = new Set();

wss.on('connection', (ws, req) => {
  console.log('[DASHBOARD] 🖥️  Cliente WebSocket conectado');
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', (err) => console.error('[DASHBOARD] WS error:', err.message));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

async function getToken() {
  let retries = 10;
  while (retries > 0) {
    try {
      const res = await axios.post(`${AUTH_SERVER}/token`, {
        client_id: 'dashboard-client',
        client_secret: 'dashboard-secret-321'
      });
      console.log('[DASHBOARD] ✅ Token JWT obtenido');
      return res.data.token;
    } catch {
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('[DASHBOARD] ❌ Sin token');
}

async function connectRabbitMQ() {
  let retries = 15;
  while (retries > 0) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      console.log('[DASHBOARD] ✅ Conectado a RabbitMQ');
      return conn;
    } catch {
      retries--;
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  throw new Error('[DASHBOARD] ❌ Sin RabbitMQ');
}

async function main() {
  await getToken();
  const conn = await connectRabbitMQ();
  const channel = await conn.createChannel();

  await channel.assertExchange('traffic_updates', 'fanout', { durable: true });
  const { queue } = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(queue, 'traffic_updates', '');

  channel.consume(queue, (msg) => {
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    broadcast(data);
    channel.ack(msg);
  });

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[DASHBOARD] 🌐 Dashboard en http://localhost:${PORT}`);
    console.log(`[DASHBOARD] 📁 HTML en: ${publicDir}`);
  });
}

main().catch(err => {
  console.error('[DASHBOARD] ❌ Error fatal:', err.message);
  process.exit(1);
});