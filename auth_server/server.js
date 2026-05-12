const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());

// Clave secreta para firmar tokens (en producción usa variables de entorno)
const JWT_SECRET = 'smarttraffic-super-secret-key-2024';
const TOKEN_EXPIRY = '1h';

// Clientes autorizados (hardcoded para este ejercicio)
const AUTHORIZED_CLIENTS = {
  'sensor-client':    { secret: 'sensor-secret-123',    role: 'sensor' },
  'processor-client': { secret: 'processor-secret-456', role: 'processor' },
  'dispatcher-client':{ secret: 'dispatcher-secret-789', role: 'dispatcher' },
  'dashboard-client': { secret: 'dashboard-secret-321', role: 'dashboard' },
  'archiver-client':  { secret: 'archiver-secret-654',  role: 'archiver' },
  'query-client':     { secret: 'query-secret-987',     role: 'query' },
};

// Endpoint para obtener token
app.post('/token', (req, res) => {
  const { client_id, client_secret } = req.body;

  if (!client_id || !client_secret) {
    return res.status(400).json({ error: 'client_id y client_secret son requeridos' });
  }

  const client = AUTHORIZED_CLIENTS[client_id];

  if (!client || client.secret !== client_secret) {
    console.log(`[AUTH] ❌ Credenciales inválidas para: ${client_id}`);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
    { client_id, role: client.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  console.log(`[AUTH] ✅ Token emitido para: ${client_id} (rol: ${client.role})`);
  res.json({ token, expires_in: TOKEN_EXPIRY });
});

// Endpoint para verificar token (lo usarán otros servicios)
app.post('/verify', (req, res) => {
  const { token } = req.body;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, payload: decoded });
  } catch (err) {
    res.status(401).json({ valid: false, error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth_server' }));

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`[AUTH] 🔐 Auth Server corriendo en puerto ${PORT}`);
});