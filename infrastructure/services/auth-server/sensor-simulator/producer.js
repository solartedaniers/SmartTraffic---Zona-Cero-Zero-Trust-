require("dotenv").config();

const { Kafka } = require("kafkajs");
const axios = require("axios");

// Configuración Kafka
const kafka = new Kafka({
  clientId: "sensor-simulator",
  brokers: [process.env.KAFKA_BROKER]
});

const producer = kafka.producer();

// Obtener token JWT
async function getToken() {

  try {

    const response = await axios.post(
      process.env.AUTH_SERVER,
      {
        client_id: "sensor",
        client_secret: "123"
      }
    );

    return response.data.token;

  } catch (error) {

    console.log("Error obteniendo token");

  }

}

// Enviar datos de tráfico
async function sendTrafficData() {

  try {

    // Obtener JWT
    const token = await getToken();

    console.log("JWT obtenido:");
    console.log(token);

    // Conectar Kafka
    await producer.connect();

    console.log("Conectado a Kafka");

    // Enviar datos cada 5 segundos
    setInterval(async () => {

      const traffic = {

        zone: "A",

        cars: Math.floor(
          Math.random() * 200
        )

      };

      await producer.send({

        topic: "traffic-data",

        messages: [
          {
            value: JSON.stringify(traffic)
          }
        ]

      });

      console.log("Datos enviados:");
      console.log(traffic);

    }, 5000);

  } catch (error) {

    console.log(error.message);

  }

}

// Iniciar simulador
sendTrafficData();