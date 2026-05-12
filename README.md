# 🚦 SmartTraffic — Zona Cero (Zero Trust)

Sistema distribuido de monitoreo de tráfico urbano en tiempo real, desplegado sobre 5 máquinas virtuales en AWS EC2 con arquitectura **Zero Trust** usando nftables, autenticación JWT, Apache Kafka (KRaft), RabbitMQ y un dashboard WebSocket.

---

## 👥 Integrantes

| Nombre | Apellido |
|---|---|
| Cristian Armando | Gómez |
| Daniers Alexander | Solarte |

**Grupo:** 12  
**Materias:** Sistemas Distribuidos · Sistemas Operativos

---

## 🎯 Objetivo de la actividad

Diseñar e implementar un sistema distribuido de monitoreo de tráfico que cumpla con los principios de **Zero Trust Security**, donde ningún componente confía implícitamente en otro. Cada microservicio debe autenticarse mediante JWT antes de operar, y el firewall de cada VM solo permite el tráfico estrictamente necesario para su función.

**Objetivos específicos:**
- Desplegar microservicios Node.js en contenedores Docker sobre 5 VMs de AWS EC2.
- Implementar autenticación centralizada con JWT.
- Usar Apache Kafka (modo KRaft) como bus de eventos para datos de tráfico.
- Usar RabbitMQ como broker de mensajes para distribución de estado procesado.
- Aplicar reglas de firewall Zero Trust con nftables en cada VM.
- Exponer un dashboard en tiempo real accesible públicamente vía WebSocket.

---

## 🏗️ Arquitectura del Sistema

```
Internet
   │
   ▼
[vm-app] ─── Puerto 3000 (Dashboard público)
   │              │
   │         alert_dispatcher + dashboard_backend
   │              │
   │    ┌─────────┴──────────┐
   │    ▼                    ▼
[vm-data]              [vm-auth]
Kafka + RabbitMQ       Auth Server JWT
   ▲                        ▲
   │                        │
[vm-core]              [vm-ingest]
traffic_processor      traffic_sensor
```

### VMs y sus roles

| VM | Rol | Servicio |
|---|---|---|
| vm-auth | Servidor de autenticación | auth_server (puerto 5000) |
| vm-data | Broker de mensajes | Apache Kafka (9092) + RabbitMQ (5672/15672) |
| vm-ingest | Ingesta de datos | traffic_sensor |
| vm-core | Procesamiento | traffic_processor |
| vm-app | Presentación | alert_dispatcher + dashboard_backend (3000) |

> ⚠️ **Nota:** Las IPs públicas de AWS cambian cada vez que se reinicia una instancia. Las IPs privadas permanecen fijas. Este proyecto usa IPs privadas para la comunicación interna.

---

## 📁 Estructura de archivos

```
SmartTraffic---Zona-Cero-Zero-Trust-/
├── auth_server/
│   ├── server.js
│   ├── Dockerfile
│   └── package.json
├── traffic_sensor/
│   ├── sensor.js
│   ├── Dockerfile
│   └── package.json
├── traffic_processor/
│   ├── processor.js
│   ├── Dockerfile
│   └── package.json
├── alert_dispatcher/
│   ├── dispatcher.js
│   ├── Dockerfile
│   └── package.json
├── dashboard_backend/
│   ├── backend.js
│   ├── Dockerfile
│   ├── package.json
│   └── public/
│       └── dashboard.html
├── kafka-config/
│   └── kraft-server.properties
└── docker-compose.yml
```

---

## 🛠️ Tecnologías usadas

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | 18 | Runtime de todos los microservicios |
| Docker | 26+ | Contenedores |
| Apache Kafka | 3.7.0 | Bus de eventos (modo KRaft, sin ZooKeeper) |
| RabbitMQ | 3.12-management | Broker fanout para distribución de estado |
| JWT (jsonwebtoken) | — | Autenticación Zero Trust |
| nftables | — | Firewall Zero Trust por VM |
| AWS EC2 | Ubuntu 26.04 | Infraestructura cloud |
| KafkaJS | 2.x | Cliente Kafka para Node.js |
| amqplib | — | Cliente RabbitMQ para Node.js |
| WebSocket (ws) | — | Comunicación en tiempo real al dashboard |

---

## ⚙️ Configuración Zero Trust con nftables

Cada VM tiene reglas de firewall que bloquean todo por defecto y solo permiten el tráfico necesario.

### vm-auth
```
# Solo acepta conexiones al puerto 5000 desde la red interna AWS
# SSH abierto para administración
ip saddr 172.16.0.0/16 tcp dport 5000 accept
tcp dport 22 accept
policy drop
```

### vm-data
```
# Kafka solo desde vm-ingest y vm-core
# RabbitMQ solo desde vm-core y vm-app
# Panel RabbitMQ (15672) público para monitoreo
# SSH abierto
policy drop
```

### vm-ingest
```
# Solo puede conectarse hacia vm-auth (puerto 5000) y vm-data Kafka (9092)
# Todo lo demás bloqueado (output restrictivo)
policy drop
```

### vm-core
```
# Solo puede conectarse hacia vm-auth (5000), Kafka (9092) y RabbitMQ (5672)
policy drop
```

### vm-app
```
# Acepta conexiones al puerto 3000 (dashboard público)
# Solo puede conectarse hacia vm-auth (5000) y RabbitMQ (5672)
policy drop
```

---

## 🚀 Despliegue en AWS

### Prerequisitos
- 5 instancias EC2 con Ubuntu 26.04 en la misma VPC y mismo Security Group
- Docker instalado en todas las VMs
- Llave SSH `.pem` para acceder a cada instancia
- Puerto 22 abierto en el Security Group para SSH
- Puerto 3000 abierto al público para el dashboard
- Puerto 15672 abierto al público para panel RabbitMQ

### Security Group — Reglas mínimas requeridas

| Puerto | Protocolo | Origen | Descripción |
|---|---|---|---|
| 22 | TCP | 0.0.0.0/0 | SSH administración |
| 5000 | TCP | Red interna VPC | Auth Server |
| 9092 | TCP | Red interna VPC | Kafka |
| 9093 | TCP | Security Group propio | KRaft controller |
| 5672 | TCP | Red interna VPC | RabbitMQ AMQP |
| 15672 | TCP | 0.0.0.0/0 | Panel RabbitMQ |
| 3000 | TCP | 0.0.0.0/0 | Dashboard público |
| ICMP | — | Security Group propio | Ping entre VMs |

---

## 🏃 Cómo correr el sistema (orden obligatorio)

> ⚠️ **Importante:** Las IPs públicas cambian al reiniciar las instancias EC2. La IP pública solo se usa para conectarte por SSH desde tu PC. La comunicación interna entre VMs usa siempre las **IPs privadas**, que no cambian.

### Paso 0 — Verificar IPs actuales

Antes de arrancar, entra a AWS Console → EC2 → Instances y anota la IP pública actual de cada VM. Las IPs privadas no cambian.

### Paso 1 — Conectarse a vm-auth y verificar

```bash
ssh -i "llave-distribuidos.pem" ubuntu@<IP_PUBLICA_VM_AUTH>
sudo docker ps
sudo docker logs auth_server
```

Si el contenedor no está corriendo:
```bash
sudo docker start auth_server
```

Debe mostrar: `[AUTH] 🔐 Auth Server corriendo en puerto 5000`

### Paso 2 — Conectarse a vm-data y verificar

```bash
ssh -i "llave-distribuidos.pem" ubuntu@<IP_PUBLICA_VM_DATA>
sudo docker ps
sudo docker logs kafka 2>&1 | tail -5
sudo docker logs rabbitmq 2>&1 | tail -5
```

Si no están corriendo:
```bash
sudo docker start kafka
sleep 30
sudo docker start rabbitmq
```

Kafka tarda ~30 segundos en inicializarse. Espera antes de continuar.

### Paso 3 — Conectarse a vm-ingest

```bash
ssh -i "llave-distribuidos.pem" ubuntu@<IP_PUBLICA_VM_INGEST>
sudo docker start traffic_sensor
sudo docker logs traffic_sensor
```

Debe mostrar: `[SENSOR] ✅ Token JWT obtenido del Auth Server` y `[SENSOR] ✅ Conectado a Kafka`

### Paso 4 — Conectarse a vm-core

```bash
ssh -i "llave-distribuidos.pem" ubuntu@<IP_PUBLICA_VM_CORE>
sudo docker start traffic_processor
sudo docker logs traffic_processor
```

Debe mostrar: `[PROCESSOR] 🗺️ KTable actualizado - Zona X: ESTADO`

### Paso 5 — Conectarse a vm-app

```bash
ssh -i "llave-distribuidos.pem" ubuntu@<IP_PUBLICA_VM_APP>
sudo docker start alert_dispatcher
sudo docker start dashboard_backend
sudo docker logs dashboard_backend
```

Debe mostrar: `[DASHBOARD] ✅ Conectado a RabbitMQ` y `[DASHBOARD] 🌐 Dashboard en http://localhost:3000`

### Paso 6 — Abrir el dashboard

Abre en el navegador: `http://<IP_PUBLICA_VM_APP>:3000`

Deberías ver las 5 zonas (A, B, C, D, E) actualizándose en tiempo real.

---

## 🔧 Comandos utilizados y su propósito

### Docker

| Comando | Propósito |
|---|---|
| `docker compose up --build` | Construir y levantar todos los servicios localmente |
| `docker compose down -v` | Detener y eliminar contenedores y volúmenes locales |
| `docker ps` | Ver contenedores en ejecución |
| `docker stop $(docker ps -q)` | Detener todos los contenedores activos |
| `docker rm $(docker ps -aq)` | Eliminar todos los contenedores parados |
| `docker rmi $(docker images -q)` | Eliminar todas las imágenes locales |
| `docker save <imagen> -o archivo.tar` | Exportar imagen Docker a archivo comprimido |
| `docker load -i archivo.tar` | Importar imagen Docker desde archivo |
| `docker start <nombre>` | Iniciar contenedor ya existente |
| `docker logs <nombre>` | Ver logs del contenedor |
| `docker logs -f <nombre>` | Ver logs en tiempo real (follow) |
| `docker run -d --name X --restart unless-stopped --network host ...` | Ejecutar contenedor en segundo plano con reinicio automático y red del host |

### SSH y transferencia de archivos

| Comando | Propósito |
|---|---|
| `ssh -i "llave.pem" ubuntu@<IP>` | Conectarse a una VM vía SSH |
| `scp -i "llave.pem" archivo.tar ubuntu@<IP>:~` | Transferir archivo a la VM |
| `chmod 400 llave.pem` | Dar permisos correctos a la llave SSH (requerido) |

### nftables (firewall)

| Comando | Propósito |
|---|---|
| `sudo nano /etc/nftables.conf` | Editar reglas del firewall |
| `sudo nft -f /etc/nftables.conf` | Aplicar reglas del firewall |
| `sudo nft list ruleset` | Ver reglas activas |
| `sudo nft flush ruleset` | Limpiar todas las reglas (cuidado: deja sin firewall) |

### Instalación de Docker en VM sin Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
```

---

## ⚡ Qué hacer cuando las IPs públicas cambian

Las IPs públicas de AWS cambian cada vez que se detiene y se inicia una instancia. La comunicación interna entre VMs **no se ve afectada** porque usa IPs privadas. Solo necesitas actualizar la IP pública para:

1. **Conectarte por SSH** desde tu computadora → usa la nueva IP pública en el comando `ssh`.
2. **Abrir el dashboard** en el navegador → usa la nueva IP pública de vm-app.
3. **Panel RabbitMQ** → usa la nueva IP pública de vm-data.

**Las IPs privadas son fijas** y están hardcodeadas en los comandos `docker run` de cada servicio. No necesitas cambiarlas.

---

## 🧩 Retos encontrados y soluciones

### Reto 1 — Error de subred duplicada en Docker Compose local
**Problema:** Al correr `docker compose up` aparecía el error `Pool overlaps with other one on this address space`.  
**Causa:** Se había definido una subred fija en el `docker-compose.yml` que colisionaba con redes Docker existentes.  
**Solución:** Se eliminó la definición de subred fija del `docker-compose.yml`, dejando que Docker asigne IPs automáticamente.

### Reto 2 — Docker bloquea tráfico externo en EC2 (iptables)
**Problema:** Aunque el Security Group de AWS tenía los puertos abiertos, los servicios no eran accesibles entre VMs.  
**Causa:** Docker en Ubuntu crea reglas `iptables` con política DROP que bloquean el tráfico entrante externo, incluso si el Security Group lo permite.  
**Solución:** Se ejecutaron todos los contenedores con `--network host`, lo que hace que usen directamente la interfaz de red de la VM sin pasar por el bridge de Docker.

### Reto 3 — vm-ingest no tenía Docker instalado
**Problema:** Al intentar cargar la imagen Docker en vm-ingest, el comando `docker` no existía.  
**Solución:** Se instaló Docker con el script oficial:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
```

### Reto 4 — Kafka KRaft con `--network host` necesita IP explícita
**Problema:** Con `--network host`, Kafka no puede usar el nombre de host `kafka` como broker address. Los clientes no podían conectarse.  
**Causa:** En modo host, el hostname del contenedor no se resuelve entre VMs.  
**Solución:** Se configuró Kafka con la IP privada de vm-data directamente en las variables de entorno `KAFKA_ADVERTISED_LISTENERS` y `KAFKA_CONTROLLER_QUORUM_VOTERS`.

### Reto 5 — Comandos SSH ejecutados antes de que la sesión abriera
**Problema:** Al pegar comandos SSH junto con los comandos de docker en la misma línea del terminal, los comandos `docker start` se ejecutaban localmente antes de conectarse.  
**Solución:** Conectarse primero con SSH, esperar el prompt de la VM, y luego ejecutar los comandos de docker por separado.

### Reto 6 — Heartbeat timeout en RabbitMQ
**Problema:** Los logs del dashboard_backend muestran `Error: Heartbeat timeout` periódicamente.  
**Causa:** RabbitMQ cierra conexiones inactivas por timeout de heartbeat.  
**Aclaración:** No es un error crítico. El contenedor tiene `--restart unless-stopped` y reconecta automáticamente. El sistema sigue funcionando.

### Reto 7 — vm-data se reinició durante el despliegue
**Problema:** La IP pública de vm-data cambió a mitad del proceso.  
**Solución:** La IP privada de vm-data no cambió, por lo que todos los servicios internos que apuntan a ella siguieron funcionando. Solo fue necesario usar la nueva IP pública para reconectarse por SSH.

---

## 🔐 Flujo de autenticación Zero Trust

```
Servicio → solicita token a vm-auth (puerto 5000)
         → vm-auth valida credenciales y emite JWT
         → Servicio incluye JWT en cada operación
         → Si JWT inválido → acceso denegado
```

Todos los servicios (sensor, processor, dispatcher, dashboard) obtienen un token JWT al iniciar antes de conectarse a Kafka o RabbitMQ.

---

## 📊 Verificación del sistema

### Dashboard web
`http://<IP_PUBLICA_VM_APP>:3000` — Muestra las 5 zonas en tiempo real.

### Panel RabbitMQ
`http://<IP_PUBLICA_VM_DATA>:15672` — Usuario: `admin` / Contraseña: `admin`  
Verifica: 3 conexiones activas, 3 consumers, mensajes fluyendo.

### Logs esperados por servicio

**auth_server:**
```
[AUTH] 🔐 Auth Server corriendo en puerto 5000
[AUTH] ✅ Token emitido para: sensor-client
```

**traffic_sensor:**
```
[SENSOR] ✅ Token JWT obtenido del Auth Server
[SENSOR] ✅ Conectado a Kafka
[SENSOR] 📡 Zona A: FLUIDO (312 vehículos)
```

**traffic_processor:**
```
[PROCESSOR] 🗺️ KTable actualizado - Zona C: MODERADO
```

**dashboard_backend:**
```
[DASHBOARD] ✅ Conectado a RabbitMQ
[DASHBOARD] 🌐 Dashboard en http://localhost:3000
[DASHBOARD] 🖥️ Cliente WebSocket conectado
```

---

## 🗒️ Notas adicionales

- Los contenedores tienen `--restart unless-stopped`, lo que significa que se reinician automáticamente si la VM se reinicia.
- KafkaJS reconecta automáticamente si Kafka se cae temporalmente; los errores `ECONNREFUSED` en los logs durante el inicio son normales.
- El modo KRaft de Kafka elimina la dependencia de ZooKeeper; el mismo broker actúa como controller.
- El CLUSTER_ID de Kafka (`MkU3OEVBNTcwNTJENDM2Qk`) debe mantenerse igual si se recrea el contenedor para que Kafka reconozca su estado previo.

---

*Proyecto desarrollado para las materias de Sistemas Distribuidos y Sistemas Operativos — Grupo 12*