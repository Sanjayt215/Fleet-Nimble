# TLS Certificates for MQTTS

## Development (self-signed)

```powershell
# Requires OpenSSL (Git for Windows includes it)
mkdir infra\certs -Force
openssl req -x509 -newkey rsa:4096 -keyout infra/certs/server.key -out infra/certs/server.crt -days 365 -nodes -subj "/CN=localhost"
```

Configure EMQX to use these certs for port 8883 (see EMQX docs).

## Production

Use Let's Encrypt:

```bash
certbot certonly --standalone -d mqtt.fleet.example.com
```

Copy to `infra/certs/` or mount directly in EMQX Docker volume.

## Mobile App

- **Dev:** Allow self-signed (debug builds only)
- **Prod:** Pin Let's Encrypt ISRG Root X1 or use system trust store

## Backend MQTT Client

```env
MQTT_URL=mqtts://mqtt.fleet.example.com:8883
MQTT_CA_PATH=/path/to/ca.crt
MQTT_REJECT_UNAUTHORIZED=true
```
