# Handoff Codex

## Proyecto
- Nombre visible actual: `Registro Ingresos Antalis Abitek`
- Aplicacion web interna para reemplazar Google Forms usados para registrar ingresos de equipos al servicio tecnico.
- Corre en Node.js + Express + EJS + SQLite (`sql.js`) y esta dockerizada.
- Diseñada para ejecutarse en una Raspberry Pi dentro de la empresa.

## Stack
- Backend: Node.js + Express
- Vistas: EJS
- BD: SQLite usando `sql.js`
- Uploads: archivos en `uploads/`
- Persistencia: `data/app.sqlite`
- Docker: `docker-compose.yml`
- Raspberry: despliegue en `/home/admin/softST`
- Correo: Gmail API OAuth con refresh token
- Impresion: ZPL para Zebra GK420t
- Acceso externo: Cloudflare Tunnel

## Roles
- `admin`
  - edita cualquier campo del ingreso
  - ve `Trabajadores`
  - ve `Configuracion`
  - ve notificaciones
  - puede reimprimir etiqueta
  - no pertenece a un area fija; puede cambiar vista entre `servicio_tecnico` y `grafica`
- `operator`
  - solo edita:
    - `estado`
    - `codigo SAP`
    - `comentario`
    - `tarea final`
    - `cotizacion`
    - `OC`
  - puede reimprimir etiqueta
  - no ve `Trabajadores`
  - no ve `Configuracion`
- `user`
  - crea ingresos
  - acceso limitado al historial segun UI actual
  - no ve `Trabajadores`
  - no ve `Configuracion`

## Multi-area y enrolamiento
- la app ahora separa informacion por area:
  - `servicio_tecnico`
  - `grafica`
- todos los trabajadores historicos fueron migrados a `servicio_tecnico`
- los trabajadores quedan vinculados a una cuenta por correo institucional
- si falta correo en un trabajador historico, se deriva automaticamente como `nombre.apellido@antalis.com`
- el enrolamiento individual crea solo cuentas `user`
- el enrolamiento masivo crea solo cuentas `user`
- `admin` y `operator` se conservan como cuentas manuales y no deben depender del enrolamiento masivo

## Credenciales internas temporales
- ver `CREDENCIALES_INTERNAS.md`

## Modulos

### Login
- autenticacion local en SQLite
- tema oscuro/claro persistente
- ya no muestra credenciales debajo del password

### Nuevo ingreso
- campos:
  - razon social
  - RUT
  - contacto
  - correo
  - telefono
  - propiedad
  - sucursal
  - equipo (marca y modelo)
  - serie
  - reporte de cliente
  - detalle y accesorios
  - ingresado por
  - imagenes
- `Ingresado por` permite escribir y sugerir
- soporta hasta `15` imagenes de `5 MB`

### Trabajadores
- solo visible para `admin`
- CRUD basico
- buscador por nombre
- en produccion deben existir `28` trabajadores
- ojo: si se modifica SQLite por fuera mientras la app corre, puede requerir reinicio del contenedor para recargar la BD en memoria

### Historial de ingresos
- tabla editable segun rol
- buscador global por cualquier campo
- campos operativos extra:
  - `estado`
  - `codigo SAP`
  - `comentario`
  - `tarea final`
  - `cotizacion`
  - `OC`
- campos largos usan modal:
  - comentario
  - reporte cliente
  - detalle/accesorios
- imagenes se abren en modal
- estados actuales:
  - `diagnostico_pendiente`
  - `no_asignado`
  - `espera_oc`
  - `finalizado`
- estado por defecto: `no_asignado`

### Notificaciones
- badge rojo en header
- centro de notificaciones para `admin`
- etapas:
  - `created`
  - `pending_action`
  - `deadline`
  - `urgent_not_updated`
- dias configurables desde admin
- cambios aplican hacia adelante, no recalculan historico ya creado

### Configuracion
- solo visible para `admin`
- pestaña `Configuracion`
- permite editar:
  - banner del correo
  - texto informativo del correo
  - dias de notificacion
  - rango de dias de diagnostico mostrado en correo

## Correo
- Gmail API ya implementada y funcional
- usa variables:
  - `MAIL_ENABLED`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REFRESH_TOKEN`
  - `GOOGLE_SENDER_EMAIL`
  - `MAIL_INTERNAL_TO`
- evento implementado:
  - correo al crear ingreso (`Registro creado`)
- destinatarios:
  - correos internos fijos
  - correo del cliente tomado del formulario
- contenido:
  - resumen del formulario
  - no mostrar desde `estado` hasta `OC`
  - adjunta imagenes reales
  - usa banner configurable
  - usa texto configurable

## Impresion
- impresora objetivo real: `Zebra GK420t`
- Raspberry la reconoce por USB como `/dev/usb/lp0`
- impresion fisica por consola ya probada
- existe cola `print_jobs`
- al crear ingreso se puede disparar impresion automatica
- reimpresion disponible desde historial
- soporta:
  - `PRINTER_MODE=tcp`
  - `PRINTER_MODE=usb`
- para Raspberry se agrego `docker-compose.pi.yml` para mapear el device USB al contenedor

## Etiqueta ZPL
- tamaño objetivo actual: `100 mm x 70 mm`
- diseño actual eliminó:
  - telefono
  - sucursal
  - rut
  - correo
  - propiedad
  - imagenes
  - codigo de barras
- campos actuales impresos:
  - ingreso #
  - fecha
  - razon social
  - contacto
  - equipo
  - serie
  - ingresado por
  - reporte del cliente
  - detalle y accesorios
- la reimpresion usa siempre el ZPL actual, no una version historica
- el layout aun puede necesitar pulido fino visual

## Branding
- nombre visible correcto: `Registro Ingresos Antalis Abitek`
- se cambió en:
  - titulo HTML
  - header
  - correo
  - etiqueta
  - logs visibles
- algunos identificadores tecnicos internos todavia contienen `softst` y eso esta bien:
  - cookies
  - localStorage
  - boundaries MIME
  - nombre imagen Docker

## Despliegue local
- corre en Docker local en:
  - `http://localhost:3000`

## Despliegue Raspberry
- IP usada: `192.168.176.66`
- ruta del proyecto: `/home/admin/softST`
- Docker y Docker Compose instalados
- Raspberry Pi Connect configurado y funcional
- puede operar headless

## Cloudflare
- `cloudflared` instalado en Raspberry
- quick tunnel temporal usado en pruebas:
  - `https://films-devices-bunch-rush.trycloudflare.com`
- sigue pendiente pasar a dominio propio persistente

## Estado actual funcional
- login funcionando
- trabajadores cargados
- nuevo ingreso funcionando
- correo al crear ingreso funcionando
- quick tunnel funcionando
- impresion fisica por USB probada
- reimpresion desde web disponible
- etiqueta ZPL funcional

## Pendientes probables
- seguir refinando layout exacto de la etiqueta 100x70 mm
- cerrar completamente el flujo de impresion automatica desde el contenedor en produccion USB
- pasar Cloudflare de quick tunnel a dominio propio persistente
- revisar backups de `data/` y `uploads/`
- eventualmente agregar correos para otras etapas de notificacion

## Archivos importantes
- `src/app.js`
- `src/services/db.js`
- `src/services/mail.js`
- `src/services/print.js`
- `src/views/entry-form.ejs`
- `src/views/entries.ejs`
- `src/views/workers.ejs`
- `src/views/settings.ejs`
- `src/views/partials/head.ejs`
- `src/views/partials/header.ejs`
- `docker-compose.yml`
- `docker-compose.pi.yml`
- `.env`
- `.env.example`

## Nota operativa importante
- Si se modifica el archivo `data/app.sqlite` por fuera mientras la app ya esta corriendo, el contenedor puede seguir mostrando datos viejos hasta reiniciar, porque `sql.js` queda cargado en memoria.
