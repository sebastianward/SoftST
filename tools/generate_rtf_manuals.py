from pathlib import Path
from PIL import Image
import binascii

ROOT = Path.cwd()
ANNOTATED = ROOT / "manual_assets" / "annotated"


def rtf_escape(text: str) -> str:
    text = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
    out = []
    for ch in text:
      code = ord(ch)
      if code <= 127:
        if ch == "\n":
          out.append(r"\line ")
        else:
          out.append(ch)
      else:
        signed = code if code < 32768 else code - 65536
        out.append(rf"\u{signed}?")
    return "".join(out)


def image_to_rtf(path: Path, max_width_px: int = 980) -> str:
    image = Image.open(path)
    width, height = image.size

    if width > max_width_px:
      scale = max_width_px / width
      width = int(width * scale)
      height = int(height * scale)
      image = image.resize((width, height))

    tmp = path.with_suffix(".tmp.png")
    image.save(tmp, format="PNG")
    data = tmp.read_bytes()
    tmp.unlink(missing_ok=True)

    hex_data = binascii.hexlify(data).decode("ascii")
    picwgoal = int(width * 15)
    pichgoal = int(height * 15)

    return (
      r"{\pard\qc"
      rf"{{\pict\pngblip\picw{width}\pich{height}\picwgoal{picwgoal}\pichgoal{pichgoal} "
      + hex_data
      + r"}}\par}"
    )


def build_rtf(title: str, sections: list[dict]) -> str:
    parts = [
      r"{\rtf1\ansi\deff0",
      r"{\fonttbl{\f0 Calibri;}{\f1 Arial;}}",
      r"\paperw11906\paperh16838\margl1134\margr1134\margt1134\margb1134",
      r"\fs24",
      rf"{{\pard\sa240\b\f0\fs36 {rtf_escape(title)}\b0\fs24\par}}",
    ]

    for section in sections:
      parts.append(rf"{{\pard\sa180\b\fs28 {rtf_escape(section['heading'])}\b0\fs24\par}}")

      for paragraph in section.get("paragraphs", []):
        parts.append(rf"{{\pard\sa120 {rtf_escape(paragraph)}\par}}")

      bullets = section.get("bullets", [])
      for bullet in bullets:
        parts.append(rf"{{\pard\li360\fi-180\sa80 \'95\tab {rtf_escape(bullet)}\par}}")

      if section.get("note"):
        parts.append(rf"{{\pard\sa120\i Nota: {rtf_escape(section['note'])}\i0\par}}")

      if section.get("image"):
        parts.append(image_to_rtf(ANNOTATED / section["image"]))
        if section.get("caption"):
          parts.append(rf"{{\pard\qc\sa180\i {rtf_escape(section['caption'])}\i0\par}}")

    parts.append("}")
    return "\n".join(parts)


docs = {
    "MANUAL_USUARIO_ADMIN.rtf": {
        "title": "Manual de Usuario Admin",
        "sections": [
            {
                "heading": "Alcance",
                "paragraphs": [
                    "El perfil admin tiene acceso completo sobre el area activa. Puede cambiar entre Servicio Tecnico y Grafica, administrar trabajadores, revisar configuraciones, operar camionetas y revisar notificaciones."
                ],
            },
            {
                "heading": "1. Iniciar sesion",
                "image": "admin_login.png",
                "caption": "Campos a completar para ingresar al sistema.",
                "bullets": [
                    "1: escribe tu correo o usuario.",
                    "2: escribe tu contrasena.",
                    "3: haz clic en Entrar.",
                ],
            },
            {
                "heading": "2. Navegacion principal",
                "image": "admin_dashboard.png",
                "caption": "Accesos principales del perfil admin.",
                "bullets": [
                    "1: Nuevo ingreso para crear un registro nuevo.",
                    "2: Trabajadores para enrolar, editar y cambiar perfil entre user y operator.",
                    "3: Configuracion para ajustes generales de correo y plazos.",
                    "4: Camionetas para asignaciones, mantencion e historial del modulo.",
                    "5: Notificaciones para revisar alertas pendientes.",
                ],
            },
            {
                "heading": "3. Gestion de trabajadores",
                "image": "admin_workers.png",
                "caption": "Mantenedor de trabajadores con cambio de perfil.",
                "bullets": [
                    "1: buscador por nombre o correo.",
                    "2: selector de Perfil para cambiar entre user y operator.",
                    "3: Guardar cambios para aplicar nombre, correo, area, perfil o estado.",
                    "4: Restablecer clave para generar una nueva clave temporal.",
                ],
                "note": "El perfil admin no se asigna desde esta pantalla; solo permite alternar entre user y operator.",
            },
            {
                "heading": "4. Camionetas - Asignaciones",
                "image": "admin_camionetas_assignments.png",
                "caption": "Asignacion diaria de camionetas.",
                "bullets": [
                    "1: subpestana Asignaciones.",
                    "2: buscador con sugerencia para escoger al trabajador.",
                    "3: Guardar para asignar o reasignar la camioneta.",
                ],
            },
            {
                "heading": "5. Camionetas - Mantencion",
                "image": "admin_camionetas_manage.png",
                "caption": "Creacion, edicion y horario de reseteo.",
                "bullets": [
                    "1: subpestana Mantencion.",
                    "2: formulario para crear una camioneta nueva o un reemplazo.",
                    "3: hora diaria de reseteo automatico del turno.",
                    "4: edicion rapida del listado existente.",
                ],
            },
            {
                "heading": "6. Camionetas - Historial",
                "image": "admin_camionetas_history.png",
                "caption": "Historial detallado de movimientos del modulo.",
                "bullets": [
                    "1: subpestana Historial.",
                    "2: tabla con eventos del turno y cambios historicos.",
                ],
            },
            {
                "heading": "7. Notificaciones",
                "image": "admin_notifications.png",
                "caption": "Revision y cierre de alertas.",
                "bullets": [
                    "1: listado de notificaciones activas o revisadas.",
                    "2: Marcar revisada para cerrar visualmente una alerta pendiente.",
                ],
            },
        ],
    },
    "MANUAL_USUARIO_OPERADOR.rtf": {
        "title": "Manual de Usuario Operador",
        "sections": [
            {
                "heading": "Alcance",
                "paragraphs": [
                    "El perfil operator opera ingresos y camionetas dentro de Servicio Tecnico. Puede editar campos operativos del historial y acceder al mantenedor e historial de camionetas."
                ],
            },
            {
                "heading": "1. Iniciar sesion",
                "image": "operator_login.png",
                "caption": "Ingreso al sistema.",
                "bullets": [
                    "1: escribe tu correo o usuario.",
                    "2: escribe tu contrasena.",
                    "3: haz clic en Entrar.",
                ],
            },
            {
                "heading": "2. Navegacion principal",
                "image": "operator_dashboard.png",
                "caption": "Accesos principales del perfil operator.",
                "bullets": [
                    "1: Ingresos para revisar y actualizar el historial.",
                    "2: Nuevo ingreso para registrar un equipo nuevo.",
                    "3: Camionetas para asignaciones, mantencion e historial del turno.",
                ],
            },
            {
                "heading": "3. Historial de ingresos",
                "image": "operator_entries.png",
                "caption": "Campos operativos editables del historial.",
                "bullets": [
                    "1: buscador general.",
                    "2: campos operativos editables de la fila.",
                    "3: acceso a modales para texto largo como comentario o detalle.",
                    "4: Reimprimir para volver a emitir la etiqueta del ingreso.",
                ],
            },
            {
                "heading": "4. Camionetas - Asignaciones",
                "image": "operator_camionetas_assignments.png",
                "caption": "Asignacion operativa de camionetas.",
                "bullets": [
                    "1: subpestana Asignaciones.",
                    "2: buscador con sugerencias para elegir al trabajador.",
                    "3: Guardar para asignar o reasignar.",
                ],
            },
            {
                "heading": "5. Camionetas - Mantencion",
                "image": "operator_camionetas_manage.png",
                "caption": "Mantenedor de camionetas y reemplazos.",
                "bullets": [
                    "1: subpestana Mantencion.",
                    "2: formulario para agregar camionetas o reemplazos.",
                    "3: horario de reseteo automatico del turno.",
                ],
            },
            {
                "heading": "6. Camionetas - Historial",
                "image": "operator_camionetas_history.png",
                "caption": "Revision de movimientos del turno.",
                "bullets": [
                    "1: subpestana Historial.",
                    "2: tabla de movimientos del modulo.",
                ],
            },
        ],
    },
    "MANUAL_USUARIO_USER.rtf": {
        "title": "Manual de Usuario User",
        "sections": [
            {
                "heading": "Alcance",
                "paragraphs": [
                    "El perfil user registra ingresos, consulta el historial en modo lectura y puede asignar camionetas dentro de Servicio Tecnico."
                ],
            },
            {
                "heading": "1. Iniciar sesion",
                "image": "user_login.png",
                "caption": "Ingreso al sistema.",
                "bullets": [
                    "1: escribe tu correo o usuario.",
                    "2: escribe tu contrasena.",
                    "3: haz clic en Entrar.",
                ],
            },
            {
                "heading": "2. Navegacion principal",
                "image": "user_dashboard.png",
                "caption": "Accesos principales del perfil user.",
                "bullets": [
                    "1: Nuevo ingreso para registrar un equipo.",
                    "2: Ingresos para consultar historial.",
                    "3: Camionetas para asignar o reasignar camionetas.",
                ],
            },
            {
                "heading": "3. Registrar un nuevo ingreso",
                "image": "user_new_entry.png",
                "caption": "Formulario principal para registrar equipos.",
                "bullets": [
                    "1: Razon social, uno de los campos obligatorios.",
                    "2: Reporte de cliente, obligatorio.",
                    "3: Ingresado por, selecciona el trabajador usando el buscador con sugerencias.",
                    "4: carga imagenes desde galeria o camara.",
                    "5: Salir para cerrar sesion cuando termines.",
                ],
            },
            {
                "heading": "4. Consultar historial",
                "image": "user_entries.png",
                "caption": "Consulta en modo lectura.",
                "bullets": [
                    "1: buscador general.",
                    "2: tabla de consulta en modo lectura.",
                ],
            },
            {
                "heading": "5. Asignar camionetas",
                "image": "user_camionetas_assignments.png",
                "caption": "Asignacion simple de camionetas.",
                "bullets": [
                    "1: subpestana Asignaciones.",
                    "2: buscador de trabajador con sugerencias.",
                    "3: Guardar para dejar la camioneta asignada.",
                ],
            },
        ],
    },
}


for file_name, doc in docs.items():
    (ROOT / file_name).write_text(build_rtf(doc["title"], doc["sections"]), encoding="utf-8")
