# Arreglos de la auditoría de junio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar los 7 arreglos verificados de AUDITORIA-2026-06.md que siguen vigentes en el código actual (varios hallazgos de los agentes resultaron ya arreglados y se descartaron tras verificación manual).

**Architecture:** Cambios quirúrgicos sobre la estructura existente: un helper puro nuevo en `lib/errors.ts` (testeado) aplicado en los puntos donde se muestran errores; un helper puro en `domain/dailyPlan.ts` + una función de servicio + UI en Today para el carryover; y retoques de una pantalla cada uno para el resto. Sin migraciones de BD, sin dependencias nuevas.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase JS, vitest (tests de dominio puros en Node).

**Verificación global:** `npm run typecheck` y `npm test` deben pasar tras cada tarea. Commits en español con formato convencional, como el historial del repo.

**Descartados tras verificación (NO hacer):**
- aria-current en nav — react-router v7 lo aplica solo (chunk-4N6VE7H7.mjs:10507).
- Recuperar contraseña — ya existe en Auth.tsx:160-170.
- "Etapa X de N" inconsistente — Goals ya usa milestoneProgressByGoal.
- Validación fin>inicio en Calendar — ya existe (Calendar.tsx:621-623).
- Contraste --text-faint — ya se corrigió a #75664e.
- Labels del editor de GoalDetail — ya existen (htmlFor en todos los campos).
- Recarga automática de PWA — decisión deliberada del usuario (commit 1ff69d4); no revertir sin pedirlo.

---

### Task 1: `friendlyError` — errores técnicos traducidos (incluye sesión expirada)

**Files:**
- Modify: `src/lib/errors.ts`
- Create: `src/lib/errors.test.ts`
- Modify: `src/hooks/useAsyncData.ts:35`
- Modify: `src/screens/Today.tsx:124,270`
- Modify: `src/screens/GoalDetail.tsx:115`
- Modify: `src/App.tsx:80`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { friendlyError } from '@/lib/errors'

describe('friendlyError', () => {
  const fallback = 'No se pudo cargar tu día.'

  it('traduce errores de red', () => {
    expect(friendlyError(new Error('Failed to fetch'), fallback)).toBe(
      'Hubo un problema de conexión. Revisa tu internet e inténtalo de nuevo.',
    )
    expect(friendlyError(new Error('NetworkError when attempting to fetch resource'), fallback)).toBe(
      'Hubo un problema de conexión. Revisa tu internet e inténtalo de nuevo.',
    )
  })

  it('traduce sesión expirada (JWT/refresh token/PGRST301)', () => {
    expect(friendlyError(new Error('JWT expired'), fallback)).toBe(
      'Tu sesión expiró. Vuelve a entrar para continuar.',
    )
    expect(friendlyError(new Error('Invalid Refresh Token: Already Used'), fallback)).toBe(
      'Tu sesión expiró. Vuelve a entrar para continuar.',
    )
    expect(friendlyError(new Error('PGRST301: JWT expired'), fallback)).toBe(
      'Tu sesión expiró. Vuelve a entrar para continuar.',
    )
  })

  it('traduce errores de permisos (RLS)', () => {
    expect(friendlyError(new Error('permission denied for table goals'), fallback)).toBe(
      'No tienes permisos para hacer eso. Vuelve a entrar e inténtalo de nuevo.',
    )
    expect(
      friendlyError(new Error('new row violates row-level security policy'), fallback),
    ).toBe('No tienes permisos para hacer eso. Vuelve a entrar e inténtalo de nuevo.')
  })

  it('cae al fallback del caller para errores desconocidos', () => {
    expect(friendlyError(new Error('duplicate key value violates unique constraint'), fallback)).toBe(fallback)
    expect(friendlyError('algo raro', fallback)).toBe(fallback)
    expect(friendlyError(null, fallback)).toBe(fallback)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/errors.test.ts`
Expected: FAIL — `friendlyError` no existe (error de import).

- [ ] **Step 3: Implementar `friendlyError`**

Agregar al final de `src/lib/errors.ts`:

```ts
/**
 * Traduce errores técnicos (red, sesión expirada, RLS) a un mensaje claro en
 * español. Para todo lo demás devuelve el `fallback` del caller, que ya viene
 * con contexto ("No se pudo cargar tu día."). Nunca exponemos el mensaje crudo.
 */
export function friendlyError(err: unknown, fallback: string): string {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const m = message.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed'))
    return 'Hubo un problema de conexión. Revisa tu internet e inténtalo de nuevo.'
  if (m.includes('jwt') || m.includes('refresh token') || m.includes('pgrst301'))
    return 'Tu sesión expiró. Vuelve a entrar para continuar.'
  if (m.includes('permission denied') || m.includes('row-level security') || m.includes('42501'))
    return 'No tienes permisos para hacer eso. Vuelve a entrar e inténtalo de nuevo.'
  return fallback
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/errors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Aplicar en los puntos donde se muestran errores**

En `src/hooks/useAsyncData.ts`, agregar import y reemplazar la línea 35:

```ts
import { friendlyError } from '@/lib/errors'
```

```ts
// antes:
        if (active) setError(err instanceof Error ? err.message : 'Error inesperado.')
// después:
        if (active) setError(friendlyError(err, 'No se pudieron cargar los datos. Inténtalo de nuevo.'))
```

En `src/screens/Today.tsx`, agregar `import { friendlyError } from '@/lib/errors'` y reemplazar:

```ts
// línea 124, antes:
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar tu día.')
// después:
        if (active) setError(friendlyError(err, 'No se pudo cargar tu día.'))
```

```ts
// línea 270, antes:
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.')
// después:
      setActionError(friendlyError(err, 'No se pudo guardar el cambio.'))
```

En `src/screens/GoalDetail.tsx`, agregar `import { friendlyError } from '@/lib/errors'` y reemplazar la línea 115:

```ts
// antes:
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar la meta.')
// después:
        if (active) setError(friendlyError(err, 'No se pudo cargar la meta.'))
```

En `src/App.tsx`, agregar `import { friendlyError } from '@/lib/errors'` y reemplazar las líneas 79-81:

```ts
// antes:
      .catch((e: unknown) =>
        active && setError(e instanceof Error ? e.message : 'No se pudo cargar tu perfil.'),
      )
// después:
      .catch((e: unknown) => active && setError(friendlyError(e, 'No se pudo cargar tu perfil.')))
```

- [ ] **Step 6: Verificar typecheck y suite completa**

Run: `npm run typecheck && npm test`
Expected: 0 errores de tipos; todos los tests pasan.

- [ ] **Step 7: Commit**

```bash
git add src/lib/errors.ts src/lib/errors.test.ts src/hooks/useAsyncData.ts src/screens/Today.tsx src/screens/GoalDetail.tsx src/App.tsx
git commit -m "fix(errores): mensajes claros para red, sesión expirada y permisos — nunca el error crudo"
```

---

### Task 2: Carryover — lo pendiente de ayer no desaparece en silencio

**Files:**
- Modify: `src/domain/dailyPlan.ts`
- Modify: `src/domain/dailyPlan.test.ts`
- Modify: `src/services/tasks.ts`
- Modify: `src/screens/Today.tsx`

- [ ] **Step 1: Escribir el test que falla (helper puro)**

Agregar al final de `src/domain/dailyPlan.test.ts`:

```ts
import { carryoverCandidates } from '@/domain/dailyPlan'
import type { Task } from '@/lib/types'

function task(p: Partial<Task> = {}): Task {
  return {
    id: 't1',
    userId: 'u',
    goalId: null,
    title: 'Tarea',
    planDate: '2026-06-11',
    source: 'user',
    status: 'pending',
    createdAt: '2026-06-11T12:00:00Z',
    doneAt: null,
    ...p,
  }
}

describe('carryoverCandidates', () => {
  it('devuelve solo tareas propias pendientes', () => {
    const tasks = [
      task({ id: 'a' }),
      task({ id: 'b', status: 'done' }),
      task({ id: 'c', status: 'postponed' }),
      task({ id: 'd', source: 'goal' }),
      task({ id: 'e', source: 'suggested' }),
    ]
    expect(carryoverCandidates(tasks).map((t) => t.id)).toEqual(['a'])
  })

  it('lista vacía si no hay nada pendiente', () => {
    expect(carryoverCandidates([task({ status: 'done' })])).toEqual([])
  })
})
```

(Los imports nuevos van junto a los existentes del archivo; `describe/expect/it` ya están importados.)

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/domain/dailyPlan.test.ts`
Expected: FAIL — `carryoverCandidates` no existe.

- [ ] **Step 3: Implementar el helper**

En `src/domain/dailyPlan.ts`, agregar `Task` al import de tipos (`import type { Goal, Task } from '@/lib/types'`) y al final del archivo:

```ts
/**
 * Tareas propias (source='user') que quedaron pendientes de un día anterior:
 * candidatas a traerse a hoy. Las acciones derivadas de metas no se arrastran
 * (su continuidad la maneja el compromiso de sesiones), y las pospuestas ya
 * fueron decisión del usuario.
 */
export function carryoverCandidates(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.source === 'user' && t.status === 'pending')
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/domain/dailyPlan.test.ts`
Expected: PASS (todos, incluidos los previos del archivo).

- [ ] **Step 5: Servicio para mover una tarea de fecha**

En `src/services/tasks.ts`, después de `setTaskStatus` (línea 68):

```ts
/** Mueve una tarea a otra fecha (traer lo pendiente de ayer a hoy). */
export async function moveTaskToDate(taskId: string, dateISO: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ plan_date: dateISO })
    .eq('id', taskId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapTask(data as TaskRow)
}
```

- [ ] **Step 6: Cargar y mostrar el aviso en Today**

En `src/screens/Today.tsx`:

a) Imports — agregar `moveTaskToDate` al import de `@/services/tasks` y `carryoverCandidates` al de `@/domain/dailyPlan`:

```ts
import { createUserTask, deleteTask, listTasksForDate, moveTaskToDate, setTaskStatus, updateTaskTitle } from '@/services/tasks'
import { carryoverCandidates, findForgottenGoal, goalsDueForReview } from '@/domain/dailyPlan'
```

b) Estado — junto a los demás useState (después de la línea 59 `const [tasks, ...]`):

```ts
  // Tareas propias de ayer que quedaron pendientes (carryover honesto, sin culpa).
  const [yesterdayPending, setYesterdayPending] = useState<Task[]>([])
```

c) Carga — en el `Promise.all` del init (líneas 91-101), agregar al final de la lista:

```ts
            listTasksForDate(userId, addDays(today, -1)).catch(() => []),
```

y el nombre en el destructuring: `loadedYesterday` (último elemento). En el bloque `if (active) { ... }` agregar:

```ts
          setYesterdayPending(carryoverCandidates(loadedYesterday))
```

d) Handlers — después de `addTask` (línea 386):

```ts
  function bringYesterdayTasks() {
    const pending = yesterdayPending
    setYesterdayPending([])
    void withErrorHandling(
      async () => {
        const moved = await Promise.all(pending.map((t) => moveTaskToDate(t.id, today)))
        setTasks((prev) => [...prev, ...moved])
        toast(moved.length === 1 ? 'Tarea traída a hoy.' : 'Tareas traídas a hoy.', 'success')
      },
      () => setYesterdayPending(pending),
    )
  }

  function dismissYesterdayTasks() {
    const pending = yesterdayPending
    setYesterdayPending([])
    void withErrorHandling(
      async () => {
        await Promise.all(pending.map((t) => setTaskStatus(t.id, 'postponed')))
      },
      () => setYesterdayPending(pending),
    )
  }
```

e) UI — en el aside, dentro de la sección "Lo que sumaste tú", inmediatamente después del `<div className="section-head">…</div>` (línea 697) y antes de `{userTasks.length > 0 && (`:

```tsx
            {yesterdayPending.length > 0 && (
              <div className="card card--tight stack stack--sm mb-3">
                <span className="small">
                  {yesterdayPending.length === 1
                    ? 'Te quedó 1 tarea pendiente de ayer:'
                    : `Te quedaron ${yesterdayPending.length} tareas pendientes de ayer:`}{' '}
                  <span className="muted">
                    {yesterdayPending.map((t) => t.title).join(' · ')}
                  </span>
                </span>
                <div className="row wrap">
                  <button className="btn btn--sm btn--primary" onClick={bringYesterdayTasks}>
                    Traer a hoy
                  </button>
                  <button className="btn btn--sm btn--subtle" onClick={dismissYesterdayTasks}>
                    Descartar
                  </button>
                </div>
              </div>
            )}
```

- [ ] **Step 7: Verificar typecheck y suite completa**

Run: `npm run typecheck && npm test`
Expected: 0 errores; todos los tests pasan.

- [ ] **Step 8: Commit**

```bash
git add src/domain/dailyPlan.ts src/domain/dailyPlan.test.ts src/services/tasks.ts src/screens/Today.tsx
git commit -m "feat(hoy): lo pendiente de ayer ya no desaparece — aviso con traer a hoy o descartar"
```

---

### Task 3: GoalDetail — doble tap en una etapa ya no compite

**Files:**
- Modify: `src/screens/GoalDetail.tsx:182-198`

- [ ] **Step 1: Activar el guard `updating` en toggleMilestone**

`MilestoneChecklist` ya se deshabilita con `disabled={!isActive || updating}` (línea 429), pero `toggleMilestone` nunca enciende `updating`, así que dos taps rápidos disparan dos requests con estado viejo. Reemplazar la función completa (líneas 182-198):

```ts
  async function toggleMilestone(m: Milestone) {
    const willBeDone = m.doneAt === null
    // Guard: el checklist se deshabilita mientras el cambio viaja, para que un
    // doble tap no dispare dos requests con estado viejo.
    setUpdating(true)
    try {
      const updated = await setMilestoneDone(m.id, willBeDone)
      const next = milestones.map((x) => (x.id === m.id ? updated : x))
      setMilestones(next)
      if (willBeDone) {
        const pendingLeft = next.filter((x) => x.doneAt === null).length
        if (pendingLeft === 0) setOfferAchieve(true)
        else toast('Etapa cumplida.', 'success')
      } else {
        setOfferAchieve(false)
      }
    } catch {
      toast('No se pudo guardar el cambio.', 'warning')
    } finally {
      setUpdating(false)
    }
  }
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/screens/GoalDetail.tsx
git commit -m "fix(meta): doble tap en una etapa ya no dispara cambios en paralelo"
```

---

### Task 4: TaskItem — última línea de voseo a español neutro

**Files:**
- Modify: `src/components/TaskItem.tsx:34`

- [ ] **Step 1: Reemplazar el copy**

```ts
// antes:
    ? 'La saltás sólo hoy. Mañana volvé si toca por frecuencia.'
// después:
    ? 'La saltas solo hoy. Mañana vuelve a aparecer si toca por frecuencia.'
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/TaskItem.tsx
git commit -m "fix(copy): última línea en voseo pasa a español neutro"
```

---

### Task 5: Progress — el toggle Progreso/Aprender deja de ser un botón mentiroso

**Files:**
- Modify: `src/screens/Progress.tsx:125-132`

- [ ] **Step 1: Igualar al patrón tablist que ya usa Learn**

Learn.tsx:205-209 ya usa `role="tablist"` + `role="tab"` + `aria-selected`. Progress usa `role="group"` + `aria-pressed` con el botón activo inerte. Reemplazar (líneas 125-132):

```tsx
      {/* La pestaña Crecer tiene dos caras: tu progreso y lo que aprendes. */}
      <div className="seg mb-4" role="tablist" aria-label="Progreso o Aprender">
        <button type="button" role="tab" aria-selected={true} className="seg__btn seg__btn--active">
          Progreso
        </button>
        <button type="button" role="tab" aria-selected={false} className="seg__btn" onClick={() => navigate('/aprender')}>
          Aprender
        </button>
      </div>
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/screens/Progress.tsx
git commit -m "fix(progreso): el toggle Progreso/Aprender usa tablist como en Aprender"
```

---

### Task 6: SessionRun — pausar/reanudar sin red avisa en vez de callar

**Files:**
- Modify: `src/screens/SessionRun.tsx` (estado ~línea 118, doPause/doResume líneas 240-266, render ~línea 469)

- [ ] **Step 1: Estado para el aviso de sincronización**

El único display de error actual es `<LoadingScreen error={...}/>` a pantalla completa (línea 206) — no sirve para un fallo no crítico. Agregar junto a los useState existentes (cerca de la línea 118):

```ts
  // Fallo no crítico (pausa/reanudar sin red): avisamos sin tirar la pantalla.
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
```

- [ ] **Step 2: Avisar en los catch de doPause/doResume**

Reemplazar ambas funciones:

```ts
  async function doPause() {
    if (!session) return
    setSaving(true)
    setSyncNotice(null)
    try {
      setSession(await pauseSession(session.id, new Date().toISOString()))
    } catch {
      // El reloj sigue corriendo (la pausa no llegó al servidor): que se sepa.
      setSyncNotice('No se pudo pausar (¿sin conexión?). Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function doResume() {
    if (!session?.pausedAt) return
    setSaving(true)
    setSyncNotice(null)
    const accumulated =
      session.pausedTotalSeconds +
      Math.max(0, Math.floor((Date.now() - new Date(session.pausedAt).getTime()) / 1000))
    try {
      setSession(await resumeSession(session.userId, session.id, accumulated))
      setNow(new Date())
    } catch {
      setSyncNotice('No se pudo reanudar (¿sin conexión?). Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 3: Render del aviso junto a los controles**

En la sección "En curso: tiempo", justo antes de `{!earlyFinish ? (` (línea ~469, después del porqué de la meta):

```tsx
            {syncNotice && (
              <div className="alert alert--warn" role="alert" style={{ width: '100%', maxWidth: 360 }}>
                {syncNotice}
              </div>
            )}
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/screens/SessionRun.tsx
git commit -m "fix(sesion): pausar o reanudar sin red avisa en vez de fallar en silencio"
```

---

### Task 7: Habits — crear un hábito confirma con toast

**Files:**
- Modify: `src/screens/Habits.tsx` (imports, handleCreate ~línea 138, formError ~línea 264)

- [ ] **Step 1: Importar y usar el toast**

Agregar import (junto a `useSession`):

```ts
import { useToast } from '@/app/toast'
```

Dentro del componente `Habits`, junto a los demás hooks:

```ts
  const { toast } = useToast()
```

En `handleCreate`, tras cerrar el formulario (`setFormOpen(false)`):

```ts
      setFormOpen(false)
      toast(`Hábito creado: ${habit.title}`, 'success')
```

- [ ] **Step 2: role="alert" en el error del formulario**

```tsx
// antes:
          {formError && <div className="alert alert--warn">{formError}</div>}
// después:
          {formError && <div className="alert alert--warn" role="alert">{formError}</div>}
```

- [ ] **Step 3: Verificar typecheck y suite completa**

Run: `npm run typecheck && npm test`
Expected: 0 errores; todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Habits.tsx
git commit -m "feat(habitos): crear un hábito confirma con toast y el error del form se anuncia"
```

---

## Self-review

- **Cobertura:** los 7 hallazgos vigentes de la auditoría que son arreglables sin decisiones de producto están cubiertos (1 por tarea). Los hallazgos de integración (hábito↔meta, resumen semanal, etc.) son features nuevas y quedan fuera de este plan a propósito.
- **Placeholders:** ninguno; cada paso tiene el código completo.
- **Consistencia de tipos:** `carryoverCandidates(Task[]) → Task[]` y `moveTaskToDate(string, string) → Promise<Task>` se usan con esas firmas en Today; `friendlyError(unknown, string) → string` en los 5 puntos de aplicación.
