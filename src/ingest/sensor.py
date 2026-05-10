import requests
import time
import json
import random
from kafka import KafkaProducer

AUTH_URL = "http://172.31.43.93:5000/login"
KAFKA_BROKER = "172.31.45.191:9092"

def get_token():
    try:
        response = requests.post(AUTH_URL, json={"username": "admin", "password": "password123"})
        print("✅ Token obtenido con éxito.")
        return response.json().get('access_token')
    except Exception as e:
        print(f"❌ Error conectando a Auth: {e}")
        return None

token = get_token()
if not token:
    print("❌ No se pudo iniciar el sensor sin token.")
    exit(1)

producer = KafkaProducer(
    bootstrap_servers=[KAFKA_BROKER],
    value_serializer=lambda v: json.dumps(v).encode('utf-8'),
    acks=1
)

print("🚀 Iniciando envío de datos a Kafka...")
while True:
    data = {
        "sensor_id": "ST-PASTO-001",
        "vehiculos_por_minuto": random.randint(10, 80),
        "estado": "fluido",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    producer.send('traffic_data', value=data)
    print(f"📡 Dato enviado: {data}")
    time.sleep(3)