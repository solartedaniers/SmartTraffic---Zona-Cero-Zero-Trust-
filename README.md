# SmartTraffic — Zona Cero (Zero Trust)

Sistema de monitoreo de tráfico urbano en tiempo real, desplegado sobre una arquitectura distribuida de 5 máquinas virtuales en AWS con principios de **Zero Trust Network Architecture (ZTNA)**.

---

## Tabla de contenidos

1. [Arquitectura del sistema](#arquitectura)
2. [Infraestructura AWS](#infraestructura)
3. [Lo que implementó el Colaborador 1 (Infra & Redes)](#colaborador-1)
4. [Lo que debe implementar el Colaborador 2 (Seguridad & Lógica)](#colaborador-2)
5. [Cómo unir ambas partes](#union)
6. [Cómo correr el sistema completo](#correr)
7. [Dificultades encontradas y cómo se resolvieron](#dificultades)
8. [Variables de entorno](#env)

---

## Arquitectura del sistema <a name="arquitectura"></a>

El sistema se compone de 5 zonas de seguridad aisladas, cada una en su propia VM:

```
Internet
    │
    ▼
[vm-auth]  ←── Emite tokens JWT a todos los servicios
    │
    ├──► [vm-ingest]   → Sensor de tráfico → publica en Kafka
    │
    ├──► [vm-data]     → Kafka (9092) + RabbitMQ (5672)
    │         ▲
    │         │ consume/publica
    ├──► [vm-core]     → Procesador KTable + Archiver
    │
    └──► [vm-app]      → Dashboard + Alert Dispatcher + Query Client
```

**Flujo de datos:**
1. El sensor en `vm-ingest` pide un token JWT a `vm-auth`
2. Con el token, publica métricas de tráfico en Kafka (`vm-data`)
3. El procesador en `vm-core` consume de Kafka y publica estado en RabbitMQ
4. Los servicios en `vm-app` consumen de RabbitMQ y sirven el dashboard

---

## Infraestructura AWS <a name="infraestructura"></a>

### Instancias EC2

| VM | ID de instancia | IP privada | Rol |
|----|----------------|------------|-----|
| vm-auth | i-0bb8e8dcd17c02818 | 172.31.43.93 | Auth Server (JWT) |
| vm-data | i-0adb8b0b7482f3b5b | 172.31.45.191 | Kafka + RabbitMQ |
| vm-ingest | i-0677774ee1e68ed88 | 172.31.46.69 | Sensor Simulator |
| vm-core | i-045e7c2f639cd80dc | 172.31.46.43 | Processor + Archiver |
| vm-app | i-0cb6ba5f37a09aad8 | 172.31.39.177 | Dashboard + Alerts |

- **Tipo:** t3.micro (Ubuntu 26.04 LTS)
- **Región:** us-east-2 (Ohio)
- **Security Group:** `smart-traffic-security-group` (sg-05caac45666a77b45)

### Security Group — Puertos abiertos entre VMs

| Puerto | Servicio | Origen |
|--------|---------|--------|
| 22 | SSH | 0.0.0.0/0 |
| 5000 | Auth Server | sg-05caac45666a77b45 |
| 9092 | Kafka | sg-05caac45666a77b45 |
| 9093 | Kafka KRaft Controller | sg-05caac45666a77b45 |
| 5672 | RabbitMQ AMQP | sg-05caac45666a77b45 |
| 15672 | RabbitMQ Management | sg-05caac45666a77b45 |
| ICMP | Ping | sg-05caac45666a77b45 |

---

## Lo que implementó el Colaborador 1 (Infra & Redes) <a name="colaborador-1"></a>

### Fase 1 — Infraestructura base

**Qué se hizo:**
- Se crearon las 5 instancias EC2 en AWS con el mismo Security Group
- Se configuró Kafka en modo **KRaft** (sin ZooKeeper) dentro de `vm-data`
- Se levantó RabbitMQ con panel de administración en `vm-data`
- Se configuró el Auth Server Flask en `vm-auth`
- Se configuró el sensor simulador en `vm-ingest`

**Por qué KRaft y no ZooKeeper:**
Kafka KRaft es el estándar moderno desde Kafka 3.x. Elimina la dependencia de ZooKeeper como software de terceros, simplifica la arquitectura y es el modo recomendado en producción. El controller quorum se maneja internamente.

**Archivos relevantes:**
- `docker/kafka/docker-compose.yml` — Kafka + RabbitMQ
- `src/auth/app.py` — Auth Server (Flask + JWT)
- `src/ingest/sensor.py` — Simulador de sensor

**Cómo levantar vm-data:**
```bash
ssh -i "llave-distribuidos.pem" ubuntu@ec2-18-223-162-198.us-east-2.compute.amazonaws.com
cd ~/docker/kafka
docker compose up -d
```

**Cómo levantar el Auth Server (vm-auth):**
```bash
ssh -i "llave-distribuidos.pem" ubuntu@ec2-52-15-67-214.us-east-2.compute.amazonaws.com
source ~/venv-auth/bin/activate
python3 ~/auth_server.py
```

**Cómo correr el sensor (vm-ingest):**
```bash
ssh -i "llave-distribuidos.pem" ubuntu@ec2-3-14-15-176.us-east-2.compute.amazonaws.com
source ~/venv-sensor/bin/activate
python3 ~/sensor.py
```

---

### Fase 2 — Autenticación

**Qué se hizo:**
- El Auth Server expone `POST /login` que recibe `username` y `password`
- Devuelve un token JWT firmado con `super-secret-key`
- El sensor solicita el token antes de conectarse a Kafka
- RabbitMQ tiene usuarios separados por servicio: `sensor`, `processor`, `app_user`
- Se eliminó el usuario `guest` de RabbitMQ (acceso anónimo prohibido)

**Usuarios RabbitMQ creados:**
```bash
# En vm-data
docker exec rabbitmq rabbitmqctl list_users
# Debe mostrar: admin, sensor, processor, app_user
```

**Por qué JWT:**
Los tokens JWT permiten autenticación sin estado (stateless). Cada servicio presenta su token en cada conexión. El servidor no necesita guardar sesiones. Es el estándar de la industria para autenticación entre microservicios.

---

### Fase 3 — Zero Trust (nftables)

**Qué se hizo:**
- Se implementó política de red "denegar por defecto" (`policy drop`) en todas las VMs
- Cada VM solo acepta tráfico en los puertos estrictamente necesarios
- La chain `input` bloquea todo lo que no esté explícitamente permitido

**Reglas aplicadas por VM:**

| VM | Acepta entrada en | Desde |
|----|------------------|-------|
| vm-auth | 5000 (auth), 22 (SSH) | Todas las VMs del proyecto |
| vm-data | 9092 (Kafka) | vm-ingest, vm-core |
| vm-data | 5672 (RabbitMQ) | vm-core, vm-app |
| vm-data | 15672 (panel) | Cualquiera (admin) |
| vm-ingest | 22 (SSH) | Cualquiera |
| vm-core | 22 (SSH) | Cualquiera |
| vm-app | 22, 3000, 8080 | Cualquiera |

**Prueba de la red blindada (desde vm-ingest):**
```bash
# Debe FALLAR (bloqueado por firewall):
nc -zv 172.31.45.191 5672

# Debe FUNCIONAR (permitido):
nc -zv 172.31.45.191 9092
nc -zv 172.31.43.93 5000
```

**Resultado obtenido:**
```
nc: connect to 172.31.45.191 port 5672 (tcp) failed: Connection timed out  ✅
Connection to 172.31.45.191 9092 port [tcp/*] succeeded!                   ✅
Connection to 172.31.43.93 5000 port [tcp/*] succeeded!                    ✅
```

**Cómo aplicar las reglas en una VM:**
```bash
sudo nft -f /etc/nftables.conf
sudo systemctl enable nftables
sudo systemctl restart nftables
```

**Verificar reglas activas:**
```bash
sudo nft list ruleset
```

---

### Fase 4 — Scripts de despliegue

Los scripts en `infrastructure/scripts/` automatizan el despliegue de cada VM desde cero.

**`deploy_vm_data.sh`** — levanta Kafka + RabbitMQ y crea los topics necesarios

**`apply_nftables.sh`** — aplica las reglas de firewall de la VM correspondiente

**`install_docker.sh`** — instala Docker en una VM nueva

---

## Lo que debe implementar el Colaborador 2 (Seguridad & Lógica) <a name="colaborador-2"></a>

El Colaborador 2 trabaja sobre la carpeta `services/` y necesita lo siguiente de la infraestructura:

### Variables que necesita del Colaborador 1

```bash
AUTH_SERVER_URL=http://172.31.43.93:5000/login
KAFKA_BROKER=172.31.45.191:9092
RABBITMQ_HOST=172.31.45.191
RABBITMQ_PORT=5672
RABBITMQ_USER=processor        # o app_user según el servicio
RABBITMQ_PASS=password_processor
JWT_SECRET=super-secret-key
```

### Servicios que debe implementar

**`services/processor-core/`** — corre en vm-core (172.31.46.43):
- Consume del topic `traffic_data` de Kafka
- Mantiene estado con KTable (conteo por zona)
- Publica estado procesado en RabbitMQ (fanout `traffic_updates`)
- Conexión a Kafka: `172.31.45.191:9092`
- Conexión a RabbitMQ: `172.31.45.191:5672` con usuario `processor`/`password_processor`

**`services/app-dashboard/`** — corre en vm-app (172.31.39.177):
- Consume de RabbitMQ el fanout `traffic_updates`
- Sirve WebSocket en puerto 3000 para el dashboard HTML
- Maneja consultas via `query_traffic_queue`
- Conexión a RabbitMQ: usuario `app_user`/`password_app`

**`services/auth-server/`** — ya está en vm-auth, el Colaborador 2 puede mejorarlo:
- Agregar más endpoints si hace falta
- El endpoint `/login` ya funciona

### Patrón de autenticación que deben seguir todos los servicios

```python
import requests

AUTH_URL = "http://172.31.43.93:5000/login"

def get_token():
    response = requests.post(AUTH_URL, json={
        "username": "admin",
        "password": "password123"
    })
    return response.json().get('access_token')

# Llamar antes de conectarse a cualquier broker
token = get_token()
```

### Cómo conectarse a RabbitMQ desde vm-core o vm-app

```python
import pika

credentials = pika.PlainCredentials('processor', 'password_processor')
connection = pika.BlockingConnection(
    pika.ConnectionParameters(
        host='172.31.45.191',
        port=5672,
        credentials=credentials
    )
)
channel = connection.channel()
```

---

## Cómo unir ambas partes <a name="union"></a>

### Orden de arranque del sistema completo

1. **vm-auth** — levantar auth server primero
2. **vm-data** — levantar Kafka y RabbitMQ
3. **vm-core** — levantar processor (depende de Kafka y RabbitMQ)
4. **vm-ingest** — levantar sensor (depende de auth y Kafka)
5. **vm-app** — levantar dashboard (depende de RabbitMQ)

### Verificación de extremo a extremo

```bash
# 1. Verificar auth server
curl -X POST http://172.31.43.93:5000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
# Esperado: {"access_token": "eyJ..."}

# 2. Verificar Kafka
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
# Esperado: traffic_data

# 3. Verificar RabbitMQ
curl -u admin:password123 http://172.31.45.191:15672/api/overview
# O abrir en navegador: http://IP_PUBLICA_VM_DATA:15672

# 4. Verificar flujo completo
# Terminal 1 — consumidor Kafka en vm-data:
docker exec -it kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic traffic_data --from-beginning

# Terminal 2 — sensor en vm-ingest:
source ~/venv-sensor/bin/activate
python3 ~/sensor.py
```

---

## Cómo correr el sistema completo <a name="correr"></a>

### Paso 1 — Clonar el repositorio en cada VM

```bash
git clone https://github.com/TU_USUARIO/SmartTraffic---Zona-Cero-Zero-Trust-.git
cd SmartTraffic---Zona-Cero-Zero-Trust-
cp .env.example .env
```

### Paso 2 — vm-data

```bash
cd docker/kafka
docker compose up -d

# Crear topics
docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic traffic_data --partitions 1 --replication-factor 1

docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic traffic_alerts --partitions 1 --replication-factor 1
```

### Paso 3 — vm-auth

```bash
source ~/venv-auth/bin/activate
python3 ~/auth_server.py
```

### Paso 4 — vm-ingest

```bash
source ~/venv-sensor/bin/activate
python3 ~/sensor.py
```

### Paso 5 — vm-core y vm-app (Colaborador 2)

```bash
# vm-core
cd services/processor-core
pip install -r requirements.txt
python3 processor.py

# vm-app
cd services/app-dashboard
pip install -r requirements.txt
python3 dashboard.py
```

---

## Dificultades encontradas y cómo se resolvieron <a name="dificultades"></a>

### 1. Kafka no arrancaba — error de KRaft quorum

**Problema:** El broker intentaba conectarse a `localhost:9093` para el quorum del controller, pero dentro del contenedor Docker esa dirección no era alcanzable.

**Error:**
```
Connection to node 1 (/172.31.45.191:9093) could not be established
```

**Solución:** Se asignó `hostname: kafka` al contenedor y se cambió el quorum voter a `1@kafka:9093` para que use el hostname interno de Docker en lugar de la IP externa.

---

### 2. Listeners duplicados en Kafka

**Problema:** El `docker-compose.yml` tenía dos listeners con el mismo nombre `PLAINTEXT`, uno para `localhost` y otro para la IP privada.

**Error:**
```
Each listener must have a different name
listeners: [PLAINTEXT://localhost:9092, PLAINTEXT://172.31.45.191:9092]
```

**Solución:** Se eliminó el listener interno redundante y se dejó solo `PLAINTEXT://0.0.0.0:9092` en `KAFKA_LISTENERS` con `PLAINTEXT://172.31.45.191:9092` en `KAFKA_ADVERTISED_LISTENERS`.

---

### 3. VM bloqueada por regla nftables mal aplicada

**Problema:** Se aplicó una regla `drop` al final del `chain output` en vm-ingest, lo que cortó el tráfico TCP de respuesta SSH.

**Solución:** Se usó el mecanismo de **User Data de EC2** para ejecutar un script al reiniciar la instancia que limpiaba el firewall (`nft flush ruleset`). Se recomienda siempre dejar `chain output` con `policy accept` en este proyecto.

---

### 4. IP pública de vm-ingest cambió al reiniciar

**Problema:** AWS asigna IPs públicas dinámicas. Al detener y reiniciar vm-ingest, la IP pública cambió de `3.22.236.163` a `18.190.155.77` y luego a `18.116.239.142`.

**Solución:** Siempre usar el **DNS público** de la instancia (visible en la consola EC2) en lugar de la IP pública. Las IPs privadas dentro de la VPC no cambian.

---

### 5. El sensor reportaba envíos exitosos pero Kafka no recibía nada

**Problema:** La librería `kafka-python` tiene buffer interno. El productor guardaba mensajes en memoria y reportaba éxito aunque Kafka no estuviera disponible.

**Solución:** Verificar siempre con el consumidor nativo (`kafka-console-consumer.sh`) que los mensajes llegan realmente al broker.

---

## Variables de entorno <a name="env"></a>

Copia `.env.example` a `.env` y completa los valores:

```bash
# IPs de las VMs (privadas, no cambian)
AUTH_SERVER_URL=http://172.31.43.93:5000/login
KAFKA_BROKER=172.31.45.191:9092
RABBITMQ_HOST=172.31.45.191
RABBITMQ_PORT=5672

# Credenciales RabbitMQ por servicio
RABBITMQ_USER_SENSOR=sensor
RABBITMQ_PASS_SENSOR=password_sensor
RABBITMQ_USER_PROCESSOR=processor
RABBITMQ_PASS_PROCESSOR=password_processor
RABBITMQ_USER_APP=app_user
RABBITMQ_PASS_APP=password_app

# JWT
JWT_SECRET=super-secret-key
```

---

## Estructura del repositorio

```
SmartTraffic---Zona-Cero-Zero-Trust-/
├── docker/
│   └── kafka/
│       └── docker-compose.yml        ← Kafka KRaft + RabbitMQ
├── infrastructure/
│   ├── networking/
│   │   ├── vm-auth.nft               ← Firewall vm-auth
│   │   ├── vm-data.nft               ← Firewall vm-data
│   │   ├── vm-ingest.nft             ← Firewall vm-ingest
│   │   ├── vm-core.nft               ← Firewall vm-core
│   │   └── vm-app.nft                ← Firewall vm-app
│   ├── scripts/
│   │   ├── install_docker.sh
│   │   ├── deploy_vm_data.sh
│   │   └── apply_nftables.sh
│   └── vms/
│       └── README_aws.md             ← IDs e IPs de las instancias
├── services/                         ← Responsabilidad Colaborador 2
│   ├── auth-server/
│   ├── sensor-simulator/
│   ├── processor-core/
│   ├── archiver/
│   └── app-dashboard/
├── src/
│   ├── auth/
│   │   └── app.py                    ← Auth server actual
│   └── ingest/
│       └── sensor.py                 ← Sensor actual
├── .env.example
└── README.md
```