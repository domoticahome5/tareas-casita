# Tareas Casita

Proyecto personal para usar desde dos teléfonos.

## Usuarios iniciales

- usuario: `walter` / clave: `1012`
- usuario: `claudia` / clave: `2700`

## Gestión de usuarios

Dentro de la app hay una pestaña **Usuarios** para:
- crear usuarios
- cambiar nombre visible
- cambiar clave
- eliminar usuarios

## Ejecutar en local

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
python app.py
```

Abre `http://127.0.0.1:5000`

Si probaste una versión anterior, borra `app.db` antes de arrancar para recrear la base con Walter y Claudia.
