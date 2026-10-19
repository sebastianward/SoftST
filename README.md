# SoftST Ingresos

Aplicacion web para registrar ingresos de equipos, administrar trabajadores y operar en una Raspberry con Docker.

## Inicio rapido

1. Copia `.env.example` a `.env`.
2. Ajusta credenciales y puerto si es necesario.
3. Instala dependencias:

```bash
npm install
```

4. Inicia en local:

```bash
npm start
```

5. O levanta con Docker:

```bash
docker compose up -d --build
```

## Credenciales iniciales

- Admin: `admin / admin` por defecto, o lo definido por `ADMIN_USERNAME` y `ADMIN_PASSWORD`
- Usuario: definidas por `USER_USERNAME` y `USER_PASSWORD`
- Operador: definidas por `OPERATOR_USERNAME` y `OPERATOR_PASSWORD`
- Referencia interna temporal de accesos: `CREDENCIALES_INTERNAS.md`

## Enrolamiento

- El enrolamiento individual crea solo cuentas `user`.
- El enrolamiento masivo crea solo cuentas `user`.
- Las cuentas `admin` y `operator` manuales se mantienen fuera del enrolamiento masivo.

## Persistencia

- Base SQLite: `./data/app.sqlite`
- Imagenes: `./uploads`

## Impresion ZPL

- Impresora objetivo: `gk420t`
- Modos soportados:
  - `tcp`: ZPL por red usando `PRINTER_HOST` y `PRINTER_PORT`
  - `usb`: ZPL directo al device local usando `PRINTER_DEVICE`
  - `serial`: COM en Windows o ttyUSB/ttyACM/ttyS/ttyAMA en Linux; baudios, bits, paridad y RTS/CTS configurables
- Mientras `PRINT_ENABLED=false`, la aplicacion deja la cola lista pero no intenta imprimir
- En Raspberry con impresora USB, levanta con:

```bash
docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d --build
```

- Configuracion sugerida para Zebra GK420t por USB:

```env
PRINT_ENABLED=true
PRINT_AUTO_ON_CREATE=true
PRINTER_MODE=usb
PRINTER_DEVICE=/dev/usb/lp0
PRINTER_NAME=gk420t
```

## Impresora opcional y configuracion

La web puede arrancar con la impresora desconectada. En Raspberry usar siempre los dos archivos Compose anteriores: se monta /dev en /host-dev y se permiten solamente las clases de dispositivos de impresora/serial necesarias, sin modo privileged ni un device obligatorio. Esto permite reconectar USB sin recrear el contenedor. Cargar `usblp` en el host si no aparece /dev/usb/lp0.

Un administrador puede abrir **Configuracion > Impresora de etiquetas ZPL**, elegir USB, Serial/COM o Ethernet y activar/pausar el envio. La configuracion se guarda en SQLite y tiene prioridad sobre .env. Los puertos pertenecen al servidor, no al computador del navegador. Ethernet requiere una impresora o servidor de impresion compatible con ZPL TCP (normalmente 9100); serial requiere parametros coincidentes con el equipo. Para serial se recomienda /dev/serial/by-id/... para evitar cambios de numeracion.

Los trabajos se guardan aunque el envio este desactivado. Si no hay conexion quedan pendientes; se reintenta cada 15 segundos y se respeta el orden. Al reiniciar se recuperan trabajos interrumpidos y fallidos anteriores. Los ultimos 30 trabajos y sus errores aparecen en Configuracion. Una entrega al dispositivo no prueba la salida fisica: un corte durante el envio puede generar duplicados al reintentar.

### Actualizar la Raspberry

Desde la carpeta real del proyecto, detener antes de respaldar SQLite:

```bash
git pull --ff-only origin main
sudo docker compose -f docker-compose.yml -f docker-compose.pi.yml stop app
mkdir -p backups
sudo tar -czf "backups/softst-$(date +%Y%m%d-%H%M%S).tgz" data uploads .env
sudo docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d --build --force-recreate app
sudo docker compose -f docker-compose.yml -f docker-compose.pi.yml ps
curl -I --max-time 10 http://localhost:3000
```

Para reinicios posteriores: `sudo docker restart softst-app-1`. El primer despliegue requiere recrear el contenedor para quitar el device obligatorio antiguo. No eliminar data ni uploads. No usar docker compose down -v.
