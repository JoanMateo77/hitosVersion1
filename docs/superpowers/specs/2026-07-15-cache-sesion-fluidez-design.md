# Cache de sesión para fluidez nativa (sin skeletons al navegar)

**Fecha:** 2026-07-15
**Estado:** Diseño aprobado — pendiente de plan de implementación

## Problema

Hoy cada pantalla arranca en `loading = true` y vuelve a pedir todos sus datos a
Supabase **cada vez que se monta**. Al navegar entre pantallas, React desmonta la
anterior (se pierde su estado) y monta la nueva desde cero: aparece el skeleton y
se dispara otra vez la carga de red, aunque hayas visitado esa pantalla hace cinco
segundos y nada haya cambiado.

Resultado: parpadeo de skeleton en **cada cambio de pantalla** → la app se siente
lenta y poco fluida, lejos de la sensación nativa.

No existe ninguna capa que recuerde lo ya cargado durante la sesión.

### Estado actual del código

- `src/hooks/useAsyncData.ts`: hook genérico de carga. Arranca en `loading: true`
  en cada montaje. Lo usan **Goals** y **Progress**.
- Pantallas complejas (**Today, GoalDetail, Habits, Calendar, Review, Learn**):
  arman su carga a mano con `useEffect` + múltiples `useState` + `Promise.all`,
  y renderizan skeletons mientras cargan.
- `src/app/session.tsx`: contexto de sesión (userId, email, profile). No cachea
  datos de pantalla.

## Objetivo

Al volver a una pantalla ya visitada en la sesión, **pintarla al instante con lo
último visto (sin skeleton)** y refrescar por detrás si hace falta. El skeleton
solo aparece en la **primera** carga en frío de cada pantalla.

## Decisiones (confirmadas con el usuario)

1. **Frescura: stale-while-revalidate.** Muestra lo cacheado al instante y siempre
   comprueba cambios por detrás; si los hay, actualiza sin skeleton. Nunca se
   queda con datos viejos de forma permanente.
2. **Duración: en memoria, por sesión.** El cache vive mientras la app está
   abierta. Una recarga completa de la página (o reabrir la PWA) arranca en frío.
   No se persiste en `localStorage` (evita complejidad y el riesgo de ver datos de
   la sesión anterior al arrancar en frío).
3. **Enfoque: hook de cache propio y ligero.** Cero dependencias nuevas; coincide
   con el estilo hecho a mano del proyecto (`useAsyncData`, `useAuth`). Se descartó
   TanStack Query/SWR (sobredimensionado, dependencia grande) y un store global
   ("objeto Dios" difícil de mantener con datos tan distintos por pantalla).

## No-objetivos (YAGNI)

- Persistir el cache entre recargas / en disco.
- Sincronización en tiempo real entre dispositivos (realtime).
- TTL configurable / expiración por tiempo (siempre revalidamos al montar).
- Reintentos automáticos, dedupe avanzado, prefetch especulativo.

## Arquitectura

### 1. Almacén de cache — `src/lib/sessionCache.ts` (nuevo)

Un `Map<string, unknown>` a nivel de módulo (vive mientras la pestaña esté abierta).

```ts
get<T>(key: string): T | undefined
set<T>(key: string, value: T): void
clear(): void            // vaciar todo (al cerrar sesión / cambiar de usuario)
```

- **Claves por usuario** para no mezclar cuentas nunca: incluyen el `userId` y los
  parámetros relevantes de la pantalla. Convención:
  - `goals:{userId}`
  - `today:{userId}:{fechaISO}`
  - `goal:{goalId}`
  - `progress:{userId}`
  - `habits:{userId}` · `calendar:{userId}:{mesISO}` · `review:{userId}` · `learn:{userId}`
- **Se vacía al cerrar sesión.** `signOut()` (y el `onAuthChange` con evento
  `SIGNED_OUT`) llaman a `clear()`. Así, si entra otra cuenta, no ve datos ajenos.

### 2. Hook `useCachedData` — `src/hooks/useCachedData.ts` (nuevo)

Reemplazo de `useAsyncData` con semántica stale-while-revalidate.

```ts
useCachedData<T>(key: string, loader: () => Promise<T>, deps: unknown[]): {
  data: T | null
  loading: boolean       // true SOLO en carga en frío (sin cache) → skeleton
  refreshing: boolean     // true mientras revalida por detrás (indicador sutil, opcional)
  error: string | null    // error a pantalla completa SOLO si falla la carga en frío
  reload: () => void
  mutate: (updater: (prev: T | null) => T) => void   // actualiza estado + cache sin ir a la red
}
```

Comportamiento:
- **Al montar, si hay cache para `key`:** `data = cache`, `loading = false`
  (sin skeleton). Lanza `loader()` por detrás (`refreshing = true`); al resolver,
  `set(key, resultado)` y actualiza el estado. Si el refresco **falla** mientras ya
  se muestran datos cacheados: **se mantiene lo cacheado** (no se pisa con error).
- **Al montar, si NO hay cache:** `loading = true` (skeleton). Al resolver,
  `set(key, resultado)` + `data`. Si falla: `error` a pantalla completa (como hoy).
- **`mutate(updater)`:** aplica el cambio al estado local **y** al cache. Lo usan
  los handlers de acciones (marcar hábito, editar meta, mover tarea…) para dejar el
  cache al día sin volver a pedir a la red, evitando el parpadeo al volver.
- Cancelación segura con bandera `active` (igual que el `useAsyncData` actual).

### 3. Adopción por pantalla

- **Fáciles (Goals, Progress):** sustituir `useAsyncData` por `useCachedData` con su
  clave. Bajo riesgo, casi mecánico.
- **Complejas (Today, GoalDetail, Habits, Calendar, Review, Learn):** consolidar su
  carga (`useEffect` + `Promise.all` + N `useState`) en **una función `loader` que
  devuelve un único objeto "snapshot"** (`{ goals, blocks, sessions, tasks, ... }`),
  y envolverla en `useCachedData`. La pantalla lee de `data.*`. Los handlers de
  mutación usan `mutate(prev => ({ ...prev, goals: siguiente }))` en vez de sus
  `setX` sueltos. Se hace **una pantalla a la vez, verificando cada una** con la app
  corriendo (`/verify`).

## Manejo de errores

- Fallo en **revalidación** (ya hay datos en pantalla): se conserva lo cacheado; no
  se muestra pantalla de error. Opcional: aviso sutil no intrusivo.
- Fallo en **carga en frío** (sin cache): pantalla de error con reintento, como hoy.
- Los mensajes siguen pasando por `friendlyError` (nunca el error crudo).

## Pruebas

Unitarias (Vitest) para `sessionCache` y `useCachedData`:
- Carga en frío → `loading = true`, luego `data` y cache poblado.
- Carga tibia (cache presente) → `loading = false` desde el inicio (sin skeleton) y
  revalidación en segundo plano que actualiza al resolver.
- Fallo en revalidación con cache presente → conserva datos, no expone error.
- `mutate` → actualiza estado y cache.
- `clear()` al cerrar sesión → la siguiente carga es en frío.

## Fases de entrega

1. **Base:** `sessionCache` + `useCachedData` + tests. Enganchar `clear()` en logout.
2. **Fáciles + la más visible:** migrar Goals, Progress y **Today**.
3. **Resto:** GoalDetail, Habits, Calendar, Review, Learn (una a una, verificando).

Cada fase deja la app funcionando y verificada.

## Riesgos y mitigaciones

- **Datos entre cuentas:** claves con `userId` + `clear()` en logout. Verificar en test.
- **Refactor de pantallas complejas** (sobre todo Today, con mucho estado derivado y
  handlers de mutación): es el grueso del riesgo. Mitigación: una pantalla a la vez,
  con verificación end-to-end antes de pasar a la siguiente.
- **Parpadeo tras mutar y volver:** cubierto por `mutate` (escribe el cache) y, en su
  defecto, por la revalidación de fondo.
