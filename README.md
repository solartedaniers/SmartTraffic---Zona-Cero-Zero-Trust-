# SmartTraffic - Sistema de Tráfico Inteligente (Zero Trust)

Este proyecto implementa una arquitectura distribuida para el monitoreo de tráfico en tiempo real, aplicando principios de **Zero Trust Architecture**.

## 🚀 Estado Actual del Proyecto
Hasta el momento, se han implementado tres capas fundamentales:

1. **Capa de Autenticación (Auth Service):**
   - Microservicio en Flask (`app.py`) que emite tokens JWT.
   - Implementa el primer pilar de Zero Trust: "Verificar explícitamente". Ningún componente confía en otro sin un token válido.

2. **Capa de Ingesta (Sensor Simulator):**
   - Script de Python (`sensor.py`) que simula un sensor físico en Pasto, Nariño.
   - El sensor solicita un token al servicio de Auth antes de poder enviar datos.
   - Envía métricas de vehículos por minuto de forma asíncrona.

3. **Broker de Mensajería (Kafka):**
   - Desplegado mediante Docker Compose en un nodo independiente.
   - Actúa como el bus de datos centralizado (`traffic_data`) que desacopla la ingesta del procesamiento.

## 🛠️ Cómo se ejecutó
- **Infraestructura:** Se crearon 3 instancias EC2 en AWS (Ubuntu 24.04).
- **Red:** Se configuraron Security Groups para permitir tráfico en los puertos `5000` (Auth), `9092` (Kafka) y `22` (SSH).
- **Contenedores:** Se utilizó Docker y el modo KRaft para Kafka, eliminando la dependencia de Zookeeper para una arquitectura más moderna.

## 📋 Próximos Pasos
- Implementar el consumidor de datos en la `vm-data`.
- Persistencia en base de datos NoSQL.
- Reglas de firewall dinámicas (`nftables`) para restringir el tráfico solo entre nodos autorizados.