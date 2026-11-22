# Especificación de Seguridad Firestore (Security Spec)

## 1. Invariantes de Datos y Control de Acceso (Zero-Trust)

1. **Bloqueo Predeterminado (Master Gate)**: Ninguna colección no declarada puede leerse ni escribirse (`match /{document=**} { allow read, write: if false; }`).
2. **Autenticación Verificada Obligatoria**: Toda operación sobre colecciones internas del negocio exige `request.auth != null && request.auth.token.email_verified == true`.
3. **RBAC Basado en Base de Datos (Sin Custom Claims del Cliente)**:
   - `isAdmin()`: Verifica `email_verified == true` para el propietario bootstrap (`diomrondon@gmail.com`) o existencia en `/admins/{request.auth.uid}`.
   - `isAuthorizedStaff()`: Verifica `isAdmin()` o un documento activo en `/authorized_staff/{request.auth.uid}`.
4. **Integridad de Identidad y Esquema Estricto**:
   - Todo documento validado con helper `isValid[Entity]` ejecutado en `create` y `update`.
   - Toda creación verifica `keys().hasAll(...)` y `keys().hasOnly(...)` para bloquear campos fantasma ("Shadow Writes").
   - Toda actualización restringe llaves mutables vía `affectedKeys().hasOnly(...)` o exige `isAdmin()` cuando corresponde.
5. **Aislamiento de PII e Inmutabilidad**:
   - `/usuarios`, `/pedidos_online`, `/ventas`, `/compras`, `/proveedores`, `/cuentas_por_cobrar`, `/cuentas_por_pagar`, `/auditoria`, `/inventario`, `/sucursales`, `/empresa_config`, `/tienda_config`, `/productos` no permiten lectura ni listado público sin autenticación autorizada.
   - La tienda online pública (`?vista=tienda`) consume el catálogo sanitizado vía backend (`GET /api/public/store-state`) y crea pedidos mediante `POST /api/pedidos`.
   - `/auditoria` es estrictamente append-only (`allow update, delete: if false;`).
   - `/ventas` y `/compras` son inmutables (`allow update: if false;`); solo `isAdmin()` puede depurar durante un reinicio de fábrica autorizado.
   - `empresa_config/main` preserva el sello `factoryResetAt` frente a reescrituras fiscales obsoletas (`fiscalUpdatedAt <= factoryResetAt`).
6. **Protección de Variables de Ruta**: Todo `{docId}` pasa por `isValidId()` (`^[a-zA-Z0-9_\-]+$`, longitud `1..128`).

## 2. "Dirty Dozen" — Payloads Maliciosos que Deben Recibir `PERMISSION_DENIED`

1. **Lectura pública de ventas**: `get` o `list` en `/ventas` sin `request.auth` -> `PERMISSION_DENIED`.
2. **Listado público de usuarios / hashes de PIN**: `list` en `/usuarios` sin `request.auth` o usuario no autorizado -> `PERMISSION_DENIED`.
3. **Auto-escalación de rol en `/admins/{uid}`**: Usuario autenticado no-admin intenta crear `/admins/$(uid)` con `{ uid, email, role: 'admin' }` -> `PERMISSION_DENIED`.
4. **Email Spoofing sin verificación**: Token con `email == 'diomrondon@gmail.com'` pero `email_verified == false` -> `PERMISSION_DENIED`.
5. **Shadow Update / Ghost Field en `/productos`**: Usuario autorizado intenta crear producto incluyendo campo no permitido `{ ..., adminBypass: true }` -> `PERMISSION_DENIED`.
6. **ID Poisoning en ruta**: Operación sobre `/productos/` con ID de 500 caracteres o caracteres inválidos (`../../etc`) -> `PERMISSION_DENIED`.
7. **Mutación o borrado de bitácora `/auditoria`**: Incluso `isAdmin()` intenta `update` o `delete` sobre `/auditoria/{logId}` -> `PERMISSION_DENIED`.
8. **Alteración de factura histórica `/ventas`**: Usuario autorizado intenta `update` sobre `/ventas/{ventaId}` -> `PERMISSION_DENIED`.
9. **Sobre-escritura fiscal post-reset en `/empresa_config/main`**: Payload con `nombreEmpresa: "Vieja"` y `fiscalUpdatedAt <= factoryResetAt` -> `PERMISSION_DENIED`.
10. **Precio o total negativo (Value Poisoning)**: Producto con `precio: -10` o Venta con `total: -50` -> `PERMISSION_DENIED`.
11. **Array no acotado (Denial of Wallet)**: Documento de `/inventario/sucursal_1` o `/pedidos_online/{id}` con lista de `> 5000` o `> 200` elementos -> `PERMISSION_DENIED`.
12. **Escritura en colección fantasma `/backdoor/{id}`**: Cualquier `read` o `write` en colección no declarada -> `PERMISSION_DENIED`.
