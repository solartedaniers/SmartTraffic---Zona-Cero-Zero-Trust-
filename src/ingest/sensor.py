import requests
import time
import json
import random
from kafka import KafkaProducer
import os

# Configuración (En producción usarías variables de entorno)
AUTH_URL = "http://TU_IP_AUTH:5000/login"
KAFKA_BROKER = "172.31.45.191:9092"

def get_token():
    try:
        response = requests.post(AUTH_URL, json={"username": "admin", "password": "password123"})
        return response.json().get('access_token')
    except Exception as e:
        print(f"❌ Error obteniendo token: {e}")
        return None

producer = KafkaProducer(
    bootstrap_servers=[KAFKA_BROKER],
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

def run_sensor():
    token = get_token()
    if not token: return
    
    print("🚀 Sensor activo enviando a Kafka...")
    while True:
        data = {
            "sensor_id": "ST-PASTO-001",
            "vehiculos_por_minuto": random.randint(10, 80),
            "estado": "fluido",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        producer.send('traffic_data', value=data)
        print(f"📡 Enviado: {data}")
        time.sleep(3)

if __name__ == "__main__":
    run_sensor()