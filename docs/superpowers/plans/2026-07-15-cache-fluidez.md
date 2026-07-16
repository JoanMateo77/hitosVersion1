# Cache de sesión para fluidez — Plan de implementación (Fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que volver a una pantalla ya visitada la pinte al instante desde un cache en memoria (sin skeleton) y refresque por detrás.

**Architecture:** Un almacén en memoria por sesión (`sessionCache`) + un hook `useCachedData` con semántica stale-while-revalidate que reemplaza a `useAsyncData`. El cache se vacía al cerrar sesión. Esta Fase 1 crea la base y migra las 2 pantallas fáciles (Goals, Progress). Today y las pantallas complejas van en un plan posterior.

**Tech Stack:** React 19, TypeScript, Vite, Vitest (entorno Node). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-07-15-cache-sesion-fluidez-design.md`

## Global Constraints

- **Sin dependencias nuevas.** No añadir librerías (ni React Query, ni testing-library, ni jsdom).
- **Cache solo en memoria**, por sesión. No persistir en localStorage/sessionStorage.
- **Claves de cache con `userId`** siempre, para no mezclar cuentas.
- **Vaciar el cache al cerrar sesión** (`sessionCache.clear()` en `signOut` y `deleteAccount`).
- **Español neutro, sin voseo** en cualquier texto de usuario.
- **Tests solo en Node**, archivos `src/**/*.test.ts` (así los recoge `vitest.config.ts`). No se testean hooks/componentes con render (no hay testing-library); su comportamiento se verifica con la app.
- **Errores por `friendlyError`** (nunca el mensaje crudo).

## File Structure

- Create: `src/lib/sessionCache.ts` — almacén en memoria (Map) con `get/set/has/clear`.
- Create: `src/lib/sessionCache.test.ts` — tests unitarios del almacén (Node).
- Create: `src/hooks/useCachedData.ts` — hook SWR sobre `sessionCache`.
- Modify: `src/services/auth.ts` — `clear()` del cache en `signOut` y `deleteAccount`.
- Modify: `src/screens/Goals.tsx:46` — usar `useCachedData` con clave `goals:{userId}`.
- Modify: `src/screens/Progress.tsx:34` — usar `useCachedData` con clave `progress:{userId}`.

---

### Task 1: Almacén de cache `sessionCache`

**Files:**
- Create: `src/lib/sessionCache.ts`
- Test: `src/lib/sessionCache.test.ts`

**Interfaces:**
- Produces:
  - `sessionCache.get<T>(key: string): T | undefined`
  - `sessionCache.set<T>(key: string, value: T): void`
  - `sessionCache.has(key: string): boolean`
  - `sessionCache.clear(): void`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sessionCache.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { sessionCache } from '@/lib/sessionCache'

describe('sessionCache', () => {
  afterEach(() => sessionCache.clear())

  it('guarda y recupera un valor', () => {
    sessionCache.set('k', { n: 1 })
    expect(sessionCache.get<{ n: number }>('k')).toEqual({ n: 1 })
  })

  it('devuelve undefined si la clave no existe', () => {
    expect(sessionCache.get('nada')).toBeUndefined()
  })

  it('has refleja la presencia de la clave', () => {
    expect(sessionCache.has('k')).toBe(false)
    sessionCache.set('k', 1)
    expect(sessionCache.has('k')).toBe(true)
  })

  it('claves distintas no se pisan', () => {
    sessionCache.set('a', 1)
    sessionCache.set('b', 2)
    expect(sessionCache.get('a')).toBe(1)
    expect(sessionCache.get('b')).toBe(2)
  })

  it('set sobreescribe el valor anterior', () => {
    sessionCache.set('k', 1)
    sessionCache.set('k', 2)
    expect(sessionCache.get('k')).toBe(2)
  })

  it('clear vacía todo', () => {
    sessionCache.set('a', 1)
    sessionCache.set('b', 2)
    sessionCache.clear()
    expect(sessionCache.get('a')).toBeUndefined()
    expect(sessionCache.has('b')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sessionCache`
Expected: FAIL — no se puede resolver `@/lib/sessionCache` (módulo no existe).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sessionCache.ts`:

```ts
/**
 * Cache en memoria por sesión: vive mientras la pestaña esté abierta; una recarga
 * completa lo vacía. Guarda instantáneas de datos de pantalla para pintarlas al
 * instante al volver, sin skeleton (ver useCachedData).
 *
 * Las claves incluyen el userId (p. ej. `goals:{userId}`), así que nunca se mezclan
 * datos entre cuentas. Además se vacía al cerrar sesión (ver services/auth.ts).
 */
const store = new Map<string, unknown>()

export const sessionCache = {
  get<T>(key: string): T | undefined {
    return store.get(key) as T | undefined
  },
  set<T>(key: string, value: T): void {
    store.set(key, value)
  },
  has(key: string): boolean {
    return store.has(key)
  },
  clear(): void {
    store.clear()
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sessionCache`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessionCache.ts src/lib/sessionCache.test.ts
git commit -m "feat(cache): almacén en memoria por sesión (sessionCache) + tests"
```

---

### Task 2: Hook `useCachedData` + vaciar cache al cerrar sesión

**Files:**
- Create: `src/hooks/useCachedData.ts`
- Modify: `src/services/auth.ts` (añadir import y `sessionCache.clear()` en `signOut` y `deleteAccount`)

**Interfaces:**
- Consumes: `sessionCache` (Task 1).
- Produces:
  - `useCachedData<T>(key: string, loader: () => Promise<T>, deps: unknown[]): CachedData<T>`
  - `interface CachedData<T> { data: T | null; loading: boolean; refreshing: boolean; error: string | null; reload: () => void; mutate: (updater: (prev: T | null) => T) => void }`

- [ ] **Step 1: Crear el hook**

Create `src/hooks/useCachedData.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { friendlyError } from '@/lib/errors'
import { sessionCache } from '@/lib/sessionCache'

export interface CachedData<T> {
  data: T | null
  /** true SOLO en carga en frío (sin cache) → mostrar skeleton. */
  loading: boolean
  /** true mientras revalida por detrás con datos ya en pantalla. */
  refreshing: boolean
  /** error a pantalla completa SOLO si falla la carga en frío. */
  error: string | null
  reload: () => void
  /** Actualiza estado + cache sin ir a la red (tras editar/marcar). */
  mutate: (updater: (prev: T | null) => T) => void
}

/**
 * Carga datos con cache en memoria + stale-while-revalidate:
 *  - Hay cache para `key` → pinta al instante (loading=false) y revalida por detrás.
 *  - No hay cache → loading=true (skeleton), carga y guarda.
 * Si la revalidación falla con datos ya cacheados, se conservan (no se pisa con error).
 * `deps` controla cuándo se re-ejecuta el loader (igual que useAsyncData).
 */
export function useCachedData<T>(
  key: string,
  loader: () => Promise<T>,
  deps: unknown[],
): CachedData<T> {
  const [data, setData] = useState<T | null>(() => sessionCache.get<T>(key) ?? null)
  const [loading, setLoading] = useState(() => sessionCache.get<T>(key) === undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Si cambia la clave sin desmontar (p. ej. otro goalId en GoalDetail), re-sincroniza
  // el estado desde el cache durante el render — patrón oficial de React para estado
  // derivado de props (evita mostrar por un instante los datos de la clave anterior).
  const [renderedKey, setRenderedKey] = useState(key)
  if (key !== renderedKey) {
    setRenderedKey(key)
    const cached = sessionCache.get<T>(key)
    setData(cached ?? null)
    setLoading(cached === undefined)
    setRefreshing(false)
    setError(null)
  }

  // El loader lo memoiza el caller vía deps explícitas (hook genérico, igual que
  // useAsyncData): el linter no puede verificarlas estáticamente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  useEffect(() => {
    let active = true
    const hadCache = sessionCache.get<T>(key) !== undefined
    if (hadCache) {
      setRefreshing(true)
    } else {
      setLoading(true)
      setError(null)
    }
    run()
      .then((result) => {
        if (!active) return
        sessionCache.set(key, result)
        setData(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        // Con datos ya en pantalla, conservarlos: no romper con un error de fondo.
        if (!hadCache) {
          setError(friendlyError(err, 'No se pudieron cargar los datos. Inténtalo de nuevo.'))
        }
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => {
      active = false
    }
    // key va en deps para revalidar si cambia; run cubre las deps del caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, reloadKey, key])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const mutate = useCallback(
    (updater: (prev: T | null) => T) => {
      setData((prev) => {
        const next = updater(prev)
        sessionCache.set(key, next)
        return next
      })
    },
    [key],
  )

  return { data, loading, refreshing, error, reload, mutate }
}
```

- [ ] **Step 2: Vaciar el cache al cerrar sesión en `services/auth.ts`**

Añadir el import junto a los otros de `@/lib`:

```ts
import { sessionCache } from '@/lib/sessionCache'
```

Reemplazar `signOut`:

```ts
export async function signOut(): Promise<void> {
  sessionCache.clear()
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}
```

En `deleteAccount`, añadir `sessionCache.clear()` como primera línea del cuerpo:

```ts
export async function deleteAccount(): Promise<void> {
  sessionCache.clear()
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw new Error(translateAuthError(error.message))
  await supabase.auth.signOut().catch(() => {})
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npm run typecheck && npm run lint`
Expected: sin errores. (El hook aún no tiene consumidores; su comportamiento se verifica al migrar Goals en la Task 3.)

- [ ] **Step 4: Correr toda la suite (no romper nada)**

Run: `npm test`
Expected: PASS (incluye los tests de `sessionCache`).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCachedData.ts src/services/auth.ts
git commit -m "feat(cache): hook useCachedData (stale-while-revalidate) y limpieza al cerrar sesión"
```

---

### Task 3: Migrar Goals a `useCachedData`

**Files:**
- Modify: `src/screens/Goals.tsx` (líneas 14 y 46-53)

**Interfaces:**
- Consumes: `useCachedData` (Task 2).

- [ ] **Step 1: Cambiar el import del hook**

En `src/screens/Goals.tsx`, reemplazar:

```ts
import { useAsyncData } from '@/hooks/useAsyncData'
```

por:

```ts
import { useCachedData } from '@/hooks/useCachedData'
```

- [ ] **Step 2: Usar `useCachedData` con clave por usuario**

Reemplazar el bloque `useAsyncData` (líneas ~46-53):

```ts
  const { data, loading, error } = useAsyncData(async () => {
    const [goals, counts, progress] = await Promise.all([
      listGoals(userId),
      countDoneByGoal(userId),
      milestoneProgressByGoal(userId),
    ])
    return { goals, counts, progress }
  }, [userId])
```

por:

```ts
  const { data, loading, error } = useCachedData(
    `goals:${userId}`,
    async () => {
      const [goals, counts, progress] = await Promise.all([
        listGoals(userId),
        countDoneByGoal(userId),
        milestoneProgressByGoal(userId),
      ])
      return { goals, counts, progress }
    },
    [userId],
  )
```

(El resto de la pantalla no cambia: sigue leyendo `data.goals`, `data.counts`, `data.progress`, `loading`, `error`.)

- [ ] **Step 3: Verificar tipos, lint y tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores; tests PASS.

- [ ] **Step 4: Verificar en la app (comportamiento real)**

Invocar el skill `/verify` (o `/run`) y comprobar, con sesión iniciada:
1. Entrar a **Metas** por primera vez → aparece el skeleton una vez, cargan las metas.
2. Ir a otra pestaña (p. ej. Progreso) y **volver a Metas** → **se pinta al instante, sin skeleton**.
3. En DevTools → Network, al volver se ve una petición de fondo (revalidación), pero la UI no parpadea.
Expected: cumplido. Si al volver sigue apareciendo skeleton, revisar que la clave y el estado inicial (`loading` lazy) sean correctos.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Goals.tsx
git commit -m "feat(metas): Metas se pinta al instante al volver — cache de sesión, sin skeleton"
```

---

### Task 4: Migrar Progress a `useCachedData`

**Files:**
- Modify: `src/screens/Progress.tsx` (líneas 16 y 34-49)

**Interfaces:**
- Consumes: `useCachedData` (Task 2).

- [ ] **Step 1: Cambiar el import del hook**

En `src/screens/Progress.tsx`, reemplazar:

```ts
import { useAsyncData } from '@/hooks/useAsyncData'
```

por:

```ts
import { useCachedData } from '@/hooks/useCachedData'
```

- [ ] **Step 2: Usar `useCachedData` con clave por usuario**

Reemplazar el bloque `useAsyncData` (líneas ~34-49):

```ts
  const { data, loading, error } = useAsyncData(async () => {
    const [goals, blocks, sessions, progressByGoal, doneMilestones, habits, habitChecks] =
      await Promise.all([
        listGoals(userId),
        listScheduleForUser(userId),
        listSessionsInRange(userId, addDays(today, -(HISTORY_DAYS - 1)), today),
        milestoneProgressByGoal(userId),
        listDoneMilestones(userId, 10),
        // Los hábitos también son progreso: degradan a vacío sin romper la pantalla.
        listHabits(userId).catch(() => [] as Habit[]),
        listHabitChecksInRange(userId, addDays(today, -(HISTORY_DAYS - 1)), today).catch(
          () => [] as HabitCheck[],
        ),
      ])
    return { goals, blocks, sessions, progressByGoal, doneMilestones, habits, habitChecks }
  }, [userId])
```

por:

```ts
  const { data, loading, error } = useCachedData(
    `progress:${userId}`,
    async () => {
      const [goals, blocks, sessions, progressByGoal, doneMilestones, habits, habitChecks] =
        await Promise.all([
          listGoals(userId),
          listScheduleForUser(userId),
          listSessionsInRange(userId, addDays(today, -(HISTORY_DAYS - 1)), today),
          milestoneProgressByGoal(userId),
          listDoneMilestones(userId, 10),
          // Los hábitos también son progreso: degradan a vacío sin romper la pantalla.
          listHabits(userId).catch(() => [] as Habit[]),
          listHabitChecksInRange(userId, addDays(today, -(HISTORY_DAYS - 1)), today).catch(
            () => [] as HabitCheck[],
          ),
        ])
      return { goals, blocks, sessions, progressByGoal, doneMilestones, habits, habitChecks }
    },
    [userId],
  )
```

(El resto de la pantalla no cambia.)

- [ ] **Step 3: Verificar tipos, lint y tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores; tests PASS.

- [ ] **Step 4: Verificar en la app**

Con `/verify` (o `/run`), sesión iniciada:
1. Entrar a **Progreso** → skeleton una vez.
2. Ir a **Metas** y volver a **Progreso** → **instantáneo, sin skeleton**.
Expected: cumplido.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Progress.tsx
git commit -m "feat(progreso): Progreso se pinta al instante al volver — cache de sesión"
```

---

## Verificación final de la Fase 1

- [ ] `npm run typecheck && npm run lint && npm test` en verde.
- [ ] En la app: navegar Metas ⇄ Progreso repetidamente → sin skeletons tras la primera visita; los datos se mantienen frescos (revalidación de fondo).
- [ ] Cerrar sesión y entrar con otra cuenta → la primera carga es en frío (skeleton) y no se ven datos de la cuenta anterior.

## Fase 2 (plan siguiente, tras validar la Fase 1)

No forma parte de las tareas ejecutables de este plan. Una vez validada la Fase 1, se
planifica la migración de las pantallas complejas **una a una, verificando cada una**:
Today, GoalDetail, Habits, Calendar, Review, Learn. Cada una consolida su carga
(`useEffect` + `Promise.all` + N `useState`) en **un único snapshot** envuelto en
`useCachedData`, y sus handlers de mutación pasan a usar `mutate(...)` para dejar el
cache al día sin ir a la red. Claves sugeridas: `today:{userId}:{fechaISO}`,
`goal:{goalId}`, `habits:{userId}`, `calendar:{userId}:{mesISO}`, `review:{userId}`,
`learn:{userId}`.
