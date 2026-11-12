# Banca Victoria — correcciones aplicadas

## Base v27
- PostgreSQL fuente de verdad; login cookie HttpOnly; roles; scrypt; transacciones en venta/anulación; límites en servidor; seed idempotente.

## Teclado (VenderScreen)
- Rápida / Compartir: tamaño de DEL, solo símbolo.
- OK (antes +): 1 toque = agregar jugada; doble toque = menú rápido.
- Nueva tecla + para cadenas de dígitos; cursor ◀ ▶ en números.
- Monto solo enteros; foco vuelve a números tras agregar jugada.

## Contabilidad
- Línea "Pago de crédito de venta" separada de créditos de premio.

## Roles
- Supervisor no crea usuarios ni grupos; solo modifica/bloquea los de su grupo.
- Supervisor y cobrador solo ven usuarios de su grupo.
- Crear/eliminar grupos solo admin.

## Admin — reset contabilidad (Configuración)
- Reset usuario / grupo / sistema completo (borra tickets, plays, ajustes; mantiene entidades).
- UI en panel Configuración con confirmaciones.

## Reportes administrativos reorganizados
- Ventas, Comisiones, Premios pagados, Cobro de ventas, Total pérdida/ganancia.
- Admin: filtros por fecha, grupo y usuario.
- Supervisor/cobrador: datos de su grupo.
- Desglose por vendedor.

## Configuración (todos los usuarios)
- Notificaciones, idioma, placeholders color/icono/contraseña/huella, filtro tickets abierto/cerrado.

Todas las cadenas nuevas en ES / FR / EN.

Despliegue: DATABASE_URL, APP_SECRET → npm install → npm run db:push → npx tsx db/seed.ts → npm run build → npm start.

## Configuración real (v30)
- **Cambio de contraseña**: endpoint `changePassword` (verifica contraseña actual, hashea con scrypt).
- **Notificaciones**: preferencias en localStorage; pide permiso del navegador; dispara al pagar premio o crédito de venta.
- **Color de tema**: 5 colores persistidos y aplicados al cargar la app.
- **Huella dactilar**: registro WebAuthn (biometría de plataforma) cuando el dispositivo lo soporta; se puede activar/desactivar.
