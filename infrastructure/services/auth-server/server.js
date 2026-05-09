require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

// Clientes autorizados
const clients = [
  {
    client_id: "sensor",
    client_secret: "123"
  },
  {
    client_id: "processor",
    client_secret: "456"
  },
  {
    client_id: "dashboard",
    client_secret: "789"
  }
];

// Endpoint para generar token
app.post("/token", (req, res) => {

  const { client_id, client_secret } = req.body;

  // Buscar cliente válido
  const client = clients.find(
    c =>
      c.client_id === client_id &&
      c.client_secret === client_secret
  );

  // Si no existe
  if (!client) {

    return res.status(401).json({
      error: "Credenciales inválidas"
    });

  }

  // Crear JWT
  const token = jwt.sign(
    { client_id },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Responder token
  res.json({ token });

});

// Iniciar servidor
app.listen(process.env.PORT, () => {

  console.log(
    `Auth Server corriendo en puerto ${process.env.PORT}`
  );

});