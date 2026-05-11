#!/bin/bash
# Script de despliegue para vm-data
# Uso: bash deploy_vm_data.sh
# VM objetivo: 172.31.45.191

set -e

echo "=== Desplegando vm-data ==="

# 1. Instalar Docker si no está
if ! command -v docker &> /dev/null; then
    echo "Instalando Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker ubuntu
    newgrp docker
fi

# 2. Ir a la carpeta del docker-compose
cd ~/docker/kafka

# 3. Levantar Kafka + RabbitMQ
echo "Levantando Kafka y RabbitMQ..."
docker compose down 2>/dev/null || true
docker compose up -d

# 4. Esperar que Kafka arranque completamente
echo "Esperando que Kafka arranque (20 segundos)..."
sleep 20

# 5. Crear topics necesarios
echo "Creando topics de Kafka..."
docker exec kafka /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server localhost:9092 \
    --create --if-not-exists \
    --topic traffic_data --partitions 1 --replication-factor 1

docker exec kafka /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server localhost:9092 \
    --create --if-not-exists \
    --topic traffic_alerts --partitions 1 --replication-factor 1

docker exec kafka /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server localhost:9092 \
    --create --if-not-exists \
    --topic query_answers --partitions 1 --replication-factor 1

# 6. Verificar usuarios RabbitMQ
echo "Verificando usuarios RabbitMQ..."
docker exec rabbitmq rabbitmqctl await_startup

# Crear usuarios si no existen
docker exec rabbitmq rabbitmqctl add_user sensor password_sensor 2>/dev/null || echo "Usuario sensor ya existe"
docker exec rabbitmq rabbitmqctl add_user processor password_processor 2>/dev/null || echo "Usuario processor ya existe"
docker exec rabbitmq rabbitmqctl add_user app_user password_app 2>/dev/null || echo "Usuario app_user ya existe"

# Asignar permisos
docker exec rabbitmq rabbitmqctl set_permissions -p / sensor ".*" ".*" ".*"
docker exec rabbitmq rabbitmqctl set_permissions -p / processor ".*" ".*" ".*"
docker exec rabbitmq rabbitmqctl set_permissions -p / app_user ".*" ".*" ".*"

echo ""
echo "=== vm-data lista ==="
echo "Kafka topics:"
docker exec kafka /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server localhost:9092 --list

echo ""
echo "Contenedores corriendo:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"