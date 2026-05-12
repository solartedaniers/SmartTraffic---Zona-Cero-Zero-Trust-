const { Kafka } = require('kafkajs');
const axios = require('axios');

const AUTH_SERVER = process.env.AUTH_SERVER_URL || 'http://auth_server:5000';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');

const ZONES = ['A', 'B', 'C', 'D', 'E'];
const STATUSES = ['FLUIDO', 'MODERADO', 'CONGESTIONADO', 'BLOQUEADO'];

// Función para obtener token JWT
async function getToken() {
  let retries = 10;
  while (retries > 0) {
    try {
      const response = await axios.post(`${AUTH_SERVER}/token`, {
        client_id: 'sensor-client',
        client_secret: 'sensor-secret-123'
      });
      console.log('[SENSOR] ✅ Token JWT obtenido del Auth Server');
      return response.data.token;
    } catch (err) {
      console.log(`[SENSOR] ⏳ Auth Server no disponible, reintentando... (${retries} intentos restantes)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('[SENSOR] ❌ No se pudo obtener token JWT');
}

async function main() {
  const token = await getToken();

  const kafka = new Kafka({
    clientId: 'traffic-sensor',
    brokers: KAFKA_BROKERS,
    // En local no usamos SASL para simplicidad
    // En producción (VMs) se activaría SASL/OAUTHBEARER aquí
  });

  const producer = kafka.producer();

  // Esperar a que Kafka esté listo
  let connected = false;
  let retries = 15;
  while (!connected && retries > 0) {
    try {
      await producer.connect();
      connected = true;
      console.log('[SENSOR] ✅ Conectado a Kafka');
    } catch (err) {
      console.log(`[SENSOR] ⏳ Kafka no disponible, reintentando... (${retries})`);
      retries--;
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  if (!connected) {
    console.error('[SENSOR] ❌ No se pudo conectar a Kafka');
    process.exit(1);
  }

  console.log('[SENSOR] 🚦 Iniciando simulación de tráfico...');

  // Publicar datos cada 3 segundos
  setInterval(async () => {
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    const vehicles = Math.floor(Math.random() * 500) + 50;

    const message = {
      zone_id: zone,
      status,
      vehicles_count: vehicles,
      timestamp: new Date().toISOString(),
      token_preview: token.substring(0, 20) + '...' // Solo para verificación visual
    };

    try {
      await producer.send({
        topic: 'traffic-events',
        messages: [{ 
          key: zone, 
          value: JSON.stringify(message) 
        }]
      });
      console.log(`[SENSOR] 📡 Zona ${zone}: ${status} (${vehicles} vehículos)`);
    } catch (err) {
      console.error('[SENSOR] ❌ Error publicando:', err.message);
    }
  }, 3000);
}

main().catch(err => {
  console.error('[SENSOR] ❌ Error fatal:', err.message);
  process.exit(1);
});