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
- Modo: ZPL por TCP/IP
- Configura `PRINTER_HOST` y `PRINTER_PORT` para habilitar pruebas reales
- Mientras `PRINT_ENABLED=false`, la aplicacion deja la cola lista pero no intenta imprimir
