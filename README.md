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
- La cola se procesa automaticamente; si no hay conexion conserva los trabajos pendientes.
- En Raspberry con impresora USB, levanta con:

```bash
docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d --build
```

- Configuracion sugerida para Zebra GK420t por USB:

```env
PRINTER_MODE=usb
PRINTER_DEVICE=/dev/usb/lp0
PRINTER_NAME=gk420t
```

## Impresora opcional y configuracion

La web puede arrancar con la impresora desconectada. En Raspberry usar siempre los dos archivos Compose anteriores: se monta /dev en /host-dev y se permiten solamente las clases de dispositivos de impresora/serial necesarias, sin modo privileged ni un device obligatorio. Esto permite reconectar USB sin recrear el contenedor. Cargar `usblp` en el host si no aparece /dev/usb/lp0.

Un administrador puede abrir **Configuracion > Impresora de etiquetas ZPL**, elegir USB, Serial/COM o Ethernet y consultar la disponibilidad de la conexion. La configuracion se guarda en SQLite y tiene prioridad sobre .env. Los puertos pertenecen al servidor, no al computador del navegador. Ethernet requiere una impresora o servidor de impresion compatible con ZPL TCP (normalmente 9100); serial requiere parametros coincidentes con el equipo. Para serial se recomienda /dev/serial/by-id/... para evitar cambios de numeracion.

Los trabajos se guardan automaticamente al crear cada ingreso. Si no hay conexion quedan pendientes; se reintenta cada 15 segundos y se respeta el orden. Al reiniciar se recuperan trabajos interrumpidos y fallidos anteriores. Los ultimos 30 trabajos y sus errores aparecen en Configuracion. Una entrega al dispositivo no prueba la salida fisica: un corte durante el envio puede generar duplicados al reintentar.

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

### Selector de conexiones

En Configuracion, USB directo y Serial/COM muestran selectores de dispositivos detectados en el servidor. Si no hay equipos compatibles se indica "No hay impresoras USB disponibles" o "No hay COM disponible". Conectar el equipo y usar **Actualizar dispositivos** para volver a consultar. Un equipo guardado que esta desconectado permanece identificado como tal; los trabajos siguen pendientes. Los dispositivos de almacenamiento y otros USB que no sean impresora o puerto serial no aparecen.

Los campos Ethernet (IP y puerto TCP) se muestran solo al elegir Ethernet. Los parametros seriales se agrupan en "Parametros del puerto COM" y no se envian ni modifican al guardar Ethernet. La deteccion en Raspberry/Docker consulta /host-dev; en Windows consulta los puertos COM del sistema.

### Estado de conexion y cola automatica

No hay interruptor de activacion. Los valores antiguos PRINT_ENABLED, PRINT_AUTO_ON_CREATE y printer_enabled ya no pausan la generacion ni el procesamiento de trabajos. Al desplegar se reanudara automaticamente la cola acumulada usando la impresora configurada.

USB y COM indican no disponible si no hay dispositivos detectados. Se conserva el dispositivo guardado si esta desconectado. Ethernet tiene **Comprobar conexion** para consultar la IP y el puerto escritos antes de guardar, sin enviar ZPL. El estado de la conexion guardada se actualiza cada 15 segundos mientras la pagina Configuracion esta visible, junto al ultimo error pendiente de la cola. La comprobacion TCP tiene un limite de tres segundos y no consulta papel ni garantiza impresion fisica. Si un envio falla, el trabajo queda en espera y se reintenta automaticamente.
