# Software Ingresos ST

## Resumen

Aplicacion web interna para registrar ingresos de equipos, administrar trabajadores por area y operar el flujo basico de seguimiento del servicio tecnico. Corre sobre Node.js, Express, EJS y SQLite mediante `sql.js`, con persistencia local en disco y despliegue pensado para Docker.

Nombre visible actual: `Registro Ingresos Antalis Abitek`.

## Stack y estructura

- Backend: Node.js + Express
- Vistas server-side: EJS
- Base de datos: SQLite usando `sql.js`
- Sesiones: `express-session`
- Passwords: `bcryptjs`
- Uploads: `multer`
- Persistencia:
  - BD: `data/app.sqlite`
  - imagenes y banner: `uploads/`
- Archivos clave:
  - `src/app.js`
  - `src/services/db.js`
  - `src/services/mail.js`
  - `src/services/print.js`
  - `src/views/`

## Modelo funcional

El sistema trabaja por areas:

- `servicio_tecnico`
- `grafica`

Los admins pueden cambiar el area visible desde el header. Los demas usuarios quedan restringidos a su area asignada.

### Roles

- `admin`
  - acceso completo
  - cambia area activa
  - crea, edita, elimina logicamente y restaura ingresos
  - administra trabajadores
  - ajusta configuracion
  - revisa notificaciones
  - puede reimprimir
- `operator`
  - ve ingresos de su area
  - edita solo campos operativos del historial
  - puede reimprimir
  - no administra trabajadores ni configuracion
- `user`
  - crea ingresos
  - consulta historial de su area en modo lectura
  - no administra trabajadores, configuracion ni notificaciones

## Autenticacion

- Login por usuario o correo.
- Sesion principal con `express-session`.
- Cookie persistente adicional `softst_auth` para restaurar sesion por hasta 30 dias.
- Cada usuario autenticado puede cambiar su propia contrasena desde la interfaz.
- Usuarios semilla definidos por variables de entorno:
  - `ADMIN_*`
  - `USER_*`
  - `OPERATOR_*`

## Trabajadores y cuentas

Cada trabajador puede quedar vinculado a un usuario del sistema.

Capacidades actuales:

- enrolamiento individual por correo institucional
- enrolamiento masivo por lista de correos
- asignacion de area al enrolar
- activacion/desactivacion de trabajador
- restablecimiento de clave desde admin
- actualizacion manual de nombre, correo y area

Comportamiento importante:

- al derivar nombre desde correo, el sistema convierte `nombre.apellido@dominio` a nombre visible
- si existen trabajadores antiguos sin correo, al iniciar se intenta completar correo institucional usando nombre + dominio configurado
- el password inicial de cuentas creadas automaticamente es `Antalis2025`
- el reset manual desde admin deja la clave temporal en `Antalis2026`
- el sistema mantiene admins fuera del flujo automatico de enrolamiento

## Ingresos

### Creacion

Formulario disponible en `/entries/new`.

Campos obligatorios actuales:

- razon social
- RUT
- contacto
- equipo
- reporte de cliente
- ingresado por

Campos opcionales actuales:

- correo
- telefono
- propiedad
- sucursal
- serie
- detalle y accesorios
- imagenes

Reglas de carga:

- hasta 15 imagenes
- maximo 5 MB por archivo
- seleccion desde galeria o camara

Al guardar un ingreso, el sistema:

1. valida trabajador activo del area
2. guarda el registro en SQLite
3. guarda rutas de imagenes en JSON
4. crea notificaciones base para ese ingreso
5. encola impresion si `PRINT_AUTO_ON_CREATE=true`
6. intenta enviar correo si `MAIL_ENABLED=true`

### Historial

Vista principal en `/entries`.

Incluye:

- buscador global cliente-side
- filtros de visibilidad:
  - pendientes
  - terminados
  - eliminados
- visualizacion de imagenes en modal
- edicion inline o por modal para campos largos
- estado de impresion mas reciente

Estados actuales:

- `diagnostico_pendiente`
- `no_asignado`
- `espera_oc`
- `finalizado`

Estado por defecto al crear: `no_asignado`.

### Edicion por rol

- `admin`: puede editar datos generales y operativos
- `operator`: solo puede editar
  - estado
  - codigo SAP
  - comentario
  - tarea final
  - cotizacion
  - OC
- `user`: no edita historial

### Eliminacion

La eliminacion actual es logica:

- se marca `deleted_at`
- se registra `deleted_by_user_id`
- el ingreso puede restaurarse

No hay eliminacion fisica del registro ni de archivos en el flujo actual.

## Notificaciones

Hay un centro de notificaciones para admin en `/notifications`.

Tipos actuales:

- `created`
- `pending_action`
- `deadline`
- `urgent_not_updated`

Las fechas se calculan desde `created_at` usando parametros configurables:

- dias hasta accion pendiente
- dias desde accion pendiente hasta plazo limite
- dias desde plazo limite hasta caso urgente

Detalles relevantes:

- al iniciar, el sistema hace backfill para ingresos existentes
- las notificaciones visibles son las vencidas hasta el momento actual
- el badge del header cuenta solo notificaciones vencidas y no revisadas del area activa
- la vista actual es funcional, pero sigue siendo una base simple para ampliar logica futura

## Configuracion

Solo accesible para admin en `/settings`.

Permite cambiar:

- dias hasta accion pendiente
- dias hasta plazo limite
- dias hasta caso urgente
- dias minimos de diagnostico
- dias maximos de diagnostico
- texto informativo del correo
- banner del correo

Los cambios de plazos aplican a ingresos nuevos; no recalculan historico existente.

## Correo

Implementado en `src/services/mail.js` usando Gmail API por OAuth refresh token.

Variables relevantes:

- `MAIL_ENABLED`
- `MAIL_TEST_TO`
- `MAIL_INTERNAL_TO`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_SENDER_EMAIL`

Comportamiento actual:

- solo existe envio automatico al crear ingreso
- destinatarios:
  - `MAIL_TEST_TO` si existe
  - lista interna `MAIL_INTERNAL_TO`
  - correo del cliente si fue informado
- el correo adjunta imagenes reales del ingreso
- puede adjuntar banner inline configurable
- incorpora texto informativo configurable

Nota importante:

- el template actual sigue marcado como `DEBUG` tanto en asunto como en contenido del correo

## Impresion

Implementada mediante cola `print_jobs`.

Flujo actual:

- al crear ingreso puede encolarse impresion automatica
- existe reimpresion manual desde historial
- un worker interno revisa la cola cada 15 segundos
- procesa hasta 3 trabajos pendientes/fallidos por ciclo

Modos soportados:

- `tcp`
- `usb`

Variables relevantes:

- `PRINT_ENABLED`
- `PRINT_AUTO_ON_CREATE`
- `PRINTER_MODE`
- `PRINTER_NAME`
- `PRINTER_HOST`
- `PRINTER_PORT`
- `PRINTER_DEVICE`

Estados de impresion:

- `pending`
- `processing`
- `printed`
- `failed`

## Etiqueta ZPL actual

La etiqueta generada hoy es compacta y no coincide con el handoff antiguo.

Campos impresos actualmente:

- nombre del sistema
- numero de ingreso
- fecha
- razon social
- contacto
- equipo
- serie
- ingresado por

No imprime actualmente:

- telefono
- sucursal
- RUT
- correo
- propiedad
- reporte del cliente
- detalle y accesorios
- imagenes
- codigo de barras

## Base de datos

Tablas actuales:

- `users`
- `workers`
- `entries`
- `notifications`
- `print_jobs`
- `app_settings`

El servicio:

- crea schema si no existe
- corre migraciones basicas
- agrega columnas faltantes
- normaliza areas legadas a `servicio_tecnico`
- migra estados antiguos a los nuevos

Detalle operativo importante:

- `sql.js` mantiene la BD cargada en memoria y la persiste a archivo en cada escritura
- si `data/app.sqlite` se modifica por fuera mientras la app esta levantada, puede ser necesario reiniciar para recargar estado real

## Frontend y UX actual

Capacidades visibles hoy:

- tema oscuro/claro persistido en `localStorage`
- busqueda instantanea de trabajadores
- busqueda instantanea de ingresos
- selector de trabajador con filtrado
- modales para imagenes, comentarios y textos largos
- modal para cambio de contrasena
- captura de imagenes desde camara en dispositivos compatibles

## Despliegue

### Local

- `npm start`
- `docker compose up -d --build`

### Docker

`docker-compose.yml` monta:

- `./data` en `/app/data`
- `./uploads` en `/app/uploads`

### Raspberry / USB

`docker-compose.pi.yml` agrega mapping del device de impresora USB:

- `${PRINTER_DEVICE:-/dev/usb/lp0}`

## Variables de entorno principales

- `PORT`
- `SESSION_SECRET`
- `DATA_DIR`
- `UPLOAD_DIR`
- `INSTITUTIONAL_EMAIL_DOMAIN`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_EMAIL`
- `USER_USERNAME`
- `USER_PASSWORD`
- `USER_EMAIL`
- `OPERATOR_USERNAME`
- `OPERATOR_PASSWORD`
- `OPERATOR_EMAIL`
- `MAIL_ENABLED`
- `MAIL_TEST_TO`
- `MAIL_INTERNAL_TO`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_SENDER_EMAIL`
- `PRINT_ENABLED`
- `PRINT_AUTO_ON_CREATE`
- `PRINTER_MODE`
- `PRINTER_NAME`
- `PRINTER_HOST`
- `PRINTER_PORT`
- `PRINTER_DEVICE`

## Estado actual resumido

Hoy el software ya cubre correctamente:

- autenticacion por roles
- separacion operativa por area
- enrolamiento y mantenimiento de trabajadores
- registro de ingresos con imagenes
- historial editable segun permisos
- eliminacion logica y restauracion
- notificaciones basadas en vencimiento
- envio de correo al crear ingreso
- cola de impresion y reimpresion
- despliegue en Docker con opcion USB para Raspberry

## Puntos a tener presentes

- el correo de alta sigue etiquetado como `DEBUG`
- la etiqueta ZPL actual es mas reducida que la descrita en el handoff viejo
- la eliminacion de ingresos es logica, no fisica
- no hay tests automatizados en el proyecto
