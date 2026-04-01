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

## Persistencia

- Base SQLite: `./data/app.sqlite`
- Imagenes: `./uploads`

## Impresion ZPL

- Impresora objetivo: `gk420t`
- Modos soportados:
  - `tcp`: ZPL por red usando `PRINTER_HOST` y `PRINTER_PORT`
  - `usb`: ZPL directo al device local usando `PRINTER_DEVICE`
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
