# Bucket List – Cuaderno Underground

MVP estático en HTML, CSS y JavaScript vanilla.

## Ejecutar

Por seguridad del navegador, los JSON se cargan mediante `fetch`, así que conviene abrir el proyecto con un servidor local:

```bash
cd bucket-list-cuaderno
python -m http.server 8000
```

Después abre `http://localhost:8000`.

## Persistencia

- Los JSON de `data/` son la semilla inicial.
- Los cambios se guardan en `localStorage` bajo la clave `bucketListNotebookStateV1`.
- Exportar genera un backup JSON.
- Importar restaura `cosplays` y `ubicaciones`.

## Migración futura

La persistencia está centralizada en `persist()` y la carga inicial en `init()`. Para Firebase, sustituye esas dos piezas por un repositorio asíncrono, manteniendo el objeto `state` y las funciones de renderizado.

## Pestaña Localizaciones
Incluye un catálogo ampliable de lugares de Asturias para photoshoots y exploración urbana, con filtros, estado de visita, notas, advertencias, mapa embebido y enlace directo a Google Maps para el móvil. Los datos iniciales están en `data/localizaciones.json`.
