# Mejoras frescas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar las mejoras vigentes de `docs/analisis/mejoras-frescas.md` (13 de 15: las #2 y #6 se invalidaron al verificarlas contra el código) más un bug encontrado al verificar (ruta `/meta/` inexistente en GoalCreated).

**Architecture:** Cambios contenidos por pantalla sobre la estructura existente; una pantalla nueva pequeña (UpdatePassword) y un sheet nuevo en la Agenda. Sin migraciones; sin dependencias nuevas. `npm run typecheck && npm test` tras cada tarea; commit por tarea.

**Tech Stack:** React 18 + TS + Vite, Supabase JS, vitest.

**Invalidadas (no hacer):** #2 ("Prefiero mirar primero" SÍ completa el onboarding vía `finish('/')`, Onboarding.tsx:126) · #6 (con bloques semanales la primera sesión siempre está a ≤7 días, GoalCreated.tsx:66-75). Se marcan como descartadas en mejoras-frescas.md (Task 10).

---

### Task 1: Recuperación de contraseña completa (#1) + ruta rota de GoalCreated

**Files:** Modify `src/services/auth.ts`, `src/app/useAuth.ts`, `src/App.tsx`, `src/screens/GoalCreated.tsx:62`. Create `src/screens/UpdatePassword.tsx`.

- [ ] **Step 1: servicio** — en `auth.ts`, tras `resetPassword`:

```ts
/** Define la contraseña nueva tras entrar por el enlace de recuperación. */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(translateAuthError(error.message))
}
```

y `onAuthChange` pasa el evento al callback:

```ts
export function onAuthChange(cb: (user: User | null, event: string) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cb(session?.user ?? null, event)
  })
  return () => data.subscription.unsubscribe()
}
```

- [ ] **Step 2: useAuth** — exponer `recovery`/`clearRecovery`:

```ts
export interface AuthState {
  user: User | null
  loading: boolean
  /** true si la sesión entró por el enlace de "olvidé mi contraseña". */
  recovery: boolean
  clearRecovery: () => void
}
```

```ts
  const [recovery, setRecovery] = useState(false)
  // dentro del effect:
    const unsubscribe = onAuthChange((nextUser, event) => {
      if (!active) return
      setUser(nextUser)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
  // y al final:
  const clearRecovery = useCallback(() => setRecovery(false), [])
  return { user, loading, recovery, clearRecovery }
```

- [ ] **Step 3: pantalla nueva** `src/screens/UpdatePassword.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { updatePassword } from '@/services/auth'
import { IconHito } from '@/components/icons'

/**
 * El enlace de "olvidé mi contraseña" inicia sesión pero no la cambia: esta
 * pantalla cierra el ciclo pidiendo la contraseña nueva antes de soltar al
 * usuario en la app. "Ahora no" deja pasar (la sesión ya es válida).
 */
export function UpdatePassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updatePassword(password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div className="screen screen--full flow-screen" style={{ justifyContent: 'center' }}>
      <form className="stack stack--lg" style={{ width: 'min(380px, 100%)', margin: '0 auto' }} onSubmit={handleSubmit}>
        <header className="center stack stack--sm" style={{ alignItems: 'center' }}>
          <span className="brand__mark" style={{ color: 'var(--primary)' }}>
            <IconHito size={56} />
          </span>
          <h1 className="screen__title">Define tu contraseña nueva</h1>
          <p className="muted small center">
            Entraste con el enlace de recuperación. Elige la contraseña que usarás de ahora en más.
          </p>
        </header>
        <div className="field">
          <label className="field__label" htmlFor="new-password">Contraseña nueva</label>
          <input
            id="new-password"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoFocus
          />
        </div>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <button className="btn btn--primary btn--block" type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar contraseña nueva'}
        </button>
        <button type="button" className="btn--link" style={{ alignSelf: 'center' }} onClick={onDone}>
          Ahora no
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: App** — en `AuthedApp`, tras obtener user:

```tsx
const { user, loading, recovery, clearRecovery } = useAuth()
// ...
if (user && recovery) {
  return (
    <div className="app">
      <UpdatePassword onDone={clearRecovery} />
    </div>
  )
}
```

(import normal de la pantalla, no lazy: pesa poco y es pre-perfil).

- [ ] **Step 5: bug ruta** — GoalCreated.tsx:62: `/meta/${goal.id}` → `/metas/${goal.id}`.
- [ ] **Step 6:** `npm run typecheck && npm test` → verde.
- [ ] **Step 7:** commit `fix(auth): el enlace de recuperación ahora pide la contraseña nueva — y GoalCreated redirige a la ruta real`

---

### Task 2: Wizard — área del perfil por defecto (#4), plantillas según el título (#3), Personalizada arriba sin detección (#7)

**Files:** Modify `src/screens/Wizard.tsx`.

- [ ] **Step 1:** default de área (línea 117): `useState<NicheId>(draft.area ?? profile.primaryNiche ?? 'otra')`. En el check `isEmpty` (líneas 155-164) quitar la condición `area === 'otra' &&` (el área siempre tiene valor; no indica input del usuario).
- [ ] **Step 2:** estados estables para el paso 1 (junto a `detectedFromTitle`):

```ts
  // Nicho que filtra las plantillas del paso 1: el del título si hubo señal, si no
  // el del perfil. Se fija al detectar, así la lista no se reordena al elegir.
  const [templateNiche, setTemplateNiche] = useState<NicheId>(() =>
    draft.templateKey && draft.templateKey !== 'personalizada'
      ? getTemplate(draft.templateKey).defaultArea
      : (profile.primaryNiche ?? 'otra'),
  )
  // Sin señal clara del título, "Personalizada (la armo yo)" va primero.
  const [customFirst, setCustomFirst] = useState(
    () => !draft.templateKey || draft.templateKey === 'personalizada',
  )
```

- [ ] **Step 3:** en `next()`, dentro del bloque de detección (paso 0):

```ts
      setTemplateNiche(detected.key !== 'personalizada' ? detected.defaultArea : (profile.primaryNiche ?? 'otra'))
      setCustomFirst(detected.key === 'personalizada')
```

- [ ] **Step 4:** lista del paso 1 — antes del `return`, derivar:

```ts
  const stepTemplates = (() => {
    const list = templatesForNiche(templateNiche)
    if (!customFirst) return list
    return [...list.filter((t) => t.key === 'personalizada'), ...list.filter((t) => t.key !== 'personalizada')]
  })()
```

y en el render del paso 1 reemplazar `templatesForNiche(profile.primaryNiche ?? 'otra').map` por `stepTemplates.map`.

- [ ] **Step 5:** typecheck + tests → commit `feat(wizard): plantillas según tu título, área del perfil por defecto y Personalizada visible sin detección`

---

### Task 3: CommitmentStep recuerda valores por tipo (#5)

**Files:** Modify `src/components/wizard/CommitmentStep.tsx`.

- [ ] **Step 1:** import `useRef` de react. Dentro del componente:

```ts
  // Memoria por tipo de medida: si vuelves de Cantidad a Tiempo (mismos días),
  // recuperas lo que habías escrito en vez de los defaults. No convertimos entre
  // tipos: "30 minutos" y "30 páginas" siguen sin ser intercambiables.
  const kindMemory = useRef<Partial<Record<TargetKind, CommitmentBlockDraft[]>>>({})
  const daysSignature = (bs: CommitmentBlockDraft[]) => bs.map((b) => b.weekday).sort().join(',')
```

- [ ] **Step 2:** reescribir `setKind`:

```ts
  function setKind(next: TargetKind) {
    if (next === kind) return
    kindMemory.current[kind] = blocks
    const remembered = kindMemory.current[next]
    if (remembered && daysSignature(remembered) === daysSignature(blocks)) {
      onChange(remembered)
      return
    }
    onChange(
      blocks.map((b) => ({
        ...b,
        targetKind: next,
        targetValue: next === 'time' ? defaultMinutes : 10,
        unit: next === 'count' ? unit || null : null,
      })),
    )
  }
```

- [ ] **Step 3:** typecheck + tests → commit `fix(wizard): alternar tiempo/cantidad ya no borra los valores escritos`

---

### Task 4: Nota de avance tras el ✓ rápido (#8)

**Files:** Modify `src/screens/Today.tsx`.

- [ ] **Step 1:** import `setSessionAccomplishment` (sumar al import de `@/services/sessions`). Estado junto a los demás:

```ts
  // Tras un ✓ rápido ofrecemos anotar el avance: es el camino más usado y el
  // diario de la meta no debería quedarse sin entradas justo ahí.
  const [notePrompt, setNotePrompt] = useState<{ sessionId: string; text: string } | null>(null)
```

- [ ] **Step 2:** en `quickDone`, tras `patchSession(s.id, {...})` agregar `setNotePrompt({ sessionId: s.id, text: '' })`; en el rollback agregar `setNotePrompt(null)`.
- [ ] **Step 3:** handler:

```ts
  function saveQuickNote() {
    const prompt = notePrompt
    setNotePrompt(null)
    const text = prompt?.text.trim()
    if (!prompt || !text) return
    void withErrorHandling(async () => {
      await setSessionAccomplishment(prompt.sessionId, text)
      toast('Avance anotado.', 'success')
    })
  }
```

- [ ] **Step 4:** render — dentro del map de `todaySessions`, después de `<SessionCard …/>` (envolver en fragment con key en el fragment):

```tsx
{notePrompt?.sessionId === session.id && (
  <div className="card card--tight stack stack--sm">
    <label className="field__label" htmlFor={`quick-note-${session.id}`}>
      ¿Qué lograste? (opcional)
    </label>
    <div className="row">
      <input
        id={`quick-note-${session.id}`}
        className="input"
        autoFocus
        maxLength={200}
        placeholder="Ej: terminé el capítulo 3…"
        value={notePrompt.text}
        onChange={(e) => setNotePrompt({ sessionId: session.id, text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveQuickNote()
          if (e.key === 'Escape') setNotePrompt(null)
        }}
      />
      <button className="btn btn--sm btn--primary" onClick={saveQuickNote}>Guardar</button>
      <button className="btn btn--sm btn--subtle" onClick={() => setNotePrompt(null)}>Omitir</button>
    </div>
  </div>
)}
```

- [ ] **Step 5:** typecheck + tests → commit `feat(hoy): el check rápido ofrece anotar qué lograste — el diario ya no se salta el camino más usado`

---

### Task 5: Aviso al romper la racha (#10)

**Files:** Modify `src/screens/Today.tsx`.

- [ ] **Step 1:** import `bestStreakCommitted` (sumar al import de `@/domain/sessions`).
- [ ] **Step 2:** tras el `useMemo` de `streak`:

```ts
  // Racha recién rota: veníamos con racha (≥2) y el último día comprometido quedó
  // sin cumplir. El chip desaparecía sin explicación — el silencio es peor.
  const streakBroken = useMemo(() => {
    if (streak !== 0 || blocks.length === 0) return null
    const doneDates = new Set<string>()
    for (const s of history) if (doneish(s)) doneDates.add(s.date)
    for (const s of sessions) if (doneish(s)) doneDates.add(s.date)
    if (doneDates.size === 0) return null
    const lastDone = [...doneDates].sort().pop()!
    if (lastDone < addDays(today, -14)) return null
    const committed = new Set(blocks.map((b) => b.weekday))
    const best = bestStreakCommitted(doneDates, committed, addDays(today, -119), today)
    if (best < 2) return null
    return { best, lastDone }
  }, [streak, history, sessions, blocks, today])

  const [streakNoticeDismissed, setStreakNoticeDismissed] = useState(false)
  const showStreakNotice =
    streakBroken !== null &&
    !streakNoticeDismissed &&
    safeGetItem(`logralo.streak-broken.${streakBroken.lastDone}`) !== '1'
  function dismissStreakNotice() {
    if (streakBroken) safeSetItem(`logralo.streak-broken.${streakBroken.lastDone}`, '1')
    setStreakNoticeDismissed(true)
  }
```

con helpers module-level al final del archivo:

```ts
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 3:** render — después del bloque `{cheerMessage && …}`:

```tsx
          {showStreakNotice && streakBroken && (
            <div className="card card--tight row row--between" role="status" style={{ alignItems: 'center' }}>
              <span className="small row row--sm" style={{ alignItems: 'center' }}>
                <IconFlame size={16} className="muted" />
                <span>
                  Tu racha se reinició. Tu récord sigue siendo <strong>{streakBroken.best} días</strong> — hoy
                  se empieza otra.
                </span>
              </span>
              <button className="btn btn--sm btn--subtle" onClick={dismissStreakNotice}>
                Entendido
              </button>
            </div>
          )}
```

- [ ] **Step 4:** typecheck + tests → commit `feat(hoy): romper la racha ya no es invisible — aviso único con tu récord intacto`

---

### Task 6: SessionRun avisa cuánto siguió el reloj sin ti (#9)

**Files:** Modify `src/screens/SessionRun.tsx`.

- [ ] **Step 1:** estado + efecto (junto a syncNotice y al efecto del tick):

```ts
  // Al volver a la pestaña tras >2 min con el reloj corriendo, lo decimos: el
  // tiempo siguió por timestamps y un salto mudo del reloj desconcierta.
  const [awayNotice, setAwayNotice] = useState<string | null>(null)
  const hiddenAt = useRef<number | null>(null)
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      const away = hiddenAt.current !== null ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (away > 120_000) {
        setNow(new Date())
        setAwayNotice(`El reloj siguió mientras no estabas (+${Math.round(away / 60_000)} min).`)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
```

- [ ] **Step 2:** limpiar en `doPause`/`doResume` (`setAwayNotice(null)` junto a `setSyncNotice(null)`). Render junto al syncNotice (sección "En curso: tiempo"), gateado por `ticking`:

```tsx
            {awayNotice && ticking && (
              <p className="small muted center" role="status" style={{ maxWidth: 360 }}>
                {awayNotice}
              </p>
            )}
```

- [ ] **Step 3:** typecheck + tests → commit `feat(sesion): al volver tras un rato, te dice cuánto siguió el reloj`

---

### Task 7: Agenda — hora sugerida (#11), "+N" en el mes (#13) y planificar sesiones (#12)

**Files:** Modify `src/screens/Calendar.tsx`, `src/styles/components.css`.

- [ ] **Step 1 (#11):** en `Calendar`, `const { userId, profile } = useSession()` y derivar:

```ts
  // Hora sugerida para el TimeSheet según el momento preferido del perfil.
  const suggestedTime =
    profile.preferredMoment === 'morning'
      ? '08:00'
      : profile.preferredMoment === 'midday'
        ? '13:00'
        : profile.preferredMoment === 'evening'
          ? '19:00'
          : null
```

`TimeSheet` recibe prop `suggested: string | null` y usa `useState(block.startTime ?? suggested ?? '')`.

- [ ] **Step 2 (#13):** celda de mes — tras los 3 dots de eventos:

```tsx
{evs.length > 3 && <span className="cal-cell__more">+{evs.length - 3}</span>}
```

CSS (junto a las reglas de `.cal-dot` en components.css):

```css
.cal-cell__more {
  font-size: 9px;
  line-height: 1;
  color: var(--text-muted);
}
```

- [ ] **Step 3 (#12):** imports: `createSpontaneousSession` (services/sessions) y `NicheIcon` (components/NicheGlyph). Estado `const [planning, setPlanning] = useState<string | null>(null)`. Handler:

```ts
  async function planSession(goal: Goal) {
    const date = planning
    setPlanning(null)
    if (!date) return
    try {
      const ownBlock = blocks.find((b) => b.goalId === goal.id)
      const created = await createSpontaneousSession(userId, goal.id, date, {
        targetKind: ownBlock?.targetKind ?? 'time',
        targetValue: ownBlock?.targetValue ?? profile.defaultSessionMinutes ?? 25,
        unit: ownBlock?.unit ?? null,
      })
      setSessions((prev) => [...prev, created])
      toast(`Sesión agregada para “${goal.title}”.`, 'success')
    } catch {
      toast('No se pudo agregar la sesión.')
    }
  }
```

`dayProps` agrega `onPlanSession: day >= today && activeGoals.length > 0 ? () => setPlanning(day) : undefined`. `DaySection` recibe `onPlanSession?: () => void` y al pie de la sección (después de la lista o del estado vacío):

```tsx
      {onPlanSession && (
        <button type="button" className="btn--link" style={{ alignSelf: 'flex-start' }} onClick={onPlanSession}>
          + Sesión para una meta
        </button>
      )}
```

Sheet (nuevo componente en el mismo archivo, patrón de TimeSheet):

```tsx
/** Hoja para sumar una sesión espontánea a una meta en el día elegido. */
function PlanSessionSheet({
  date,
  goals,
  onPick,
  onClose,
}: {
  date: string
  goals: Goal[]
  onPick: (g: Goal) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet__backdrop" onClick={onClose} />
      <div ref={panelRef} className="sheet__panel stack stack--lg">
        <div className="row row--between">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿A qué meta le sumas una sesión?</h2>
          <button type="button" className="iconbtn iconbtn--sm" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Se agrega para el {formatWeekday(date)}, además de tu compromiso.
        </p>
        <div className="stack stack--sm">
          {goals.map((g) => (
            <button key={g.id} type="button" className="chip" style={{ justifyContent: 'flex-start' }} onClick={() => onPick(g)}>
              <NicheIcon area={g.area} size={14} /> {g.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

Render junto a TimeSheet: `{planning && <PlanSessionSheet date={planning} goals={activeGoals} onPick={(g) => void planSession(g)} onClose={() => setPlanning(null)} />}`.

- [ ] **Step 4:** typecheck + tests → commit `feat(agenda): planifica desde el calendario — sesión espontánea en cualquier día, hora sugerida según tu ritmo y +N en el mes`

---

### Task 8: Revisión — saltar y contexto para decidir (#14)

**Files:** Modify `src/screens/Review.tsx`.

- [ ] **Step 1:** imports: `listSessionsInRange` (services/sessions), `addDays, formatWeekday, startOfWeek, todayISO` (lib/date), tipo `Session`. Estado `const [sessions, setSessions] = useState<Session[]>([])` + `const [skipped, setSkipped] = useState(0)`. En el effect, cargar en paralelo:

```ts
    const today = todayISO()
    Promise.all([listGoals(userId), listSessionsInRange(userId, addDays(today, -29), today)])
      .then(async ([gs, sess]) => {
        const due = goalsDueForReview(gs)
        const lists = await Promise.all(due.map((g) => listMilestones(g.id)))
        if (!active) return
        setGoals(due)
        setSessions(sess)
        setMilestonesByGoal(new Map(due.map((g, i) => [g.id, lists[i]])))
        setLoading(false)
      })
```

- [ ] **Step 2:** contexto por meta (junto a `stage`/`firstPending`):

```ts
  // Contexto para decidir: cuánto trabajaste esta meta últimamente.
  const goalDone = sessions.filter(
    (s) => s.goalId === goal.id && (s.status === 'done' || s.status === 'partial'),
  )
  const weekCount = goalDone.filter((s) => s.date >= startOfWeek(todayISO())).length
  const lastDoneDate = goalDone.map((s) => s.date).sort().pop() ?? null
```

y bajo el Roadmap (dentro del card):

```tsx
        <span className="faint tiny">
          {weekCount > 0
            ? `${weekCount} ${weekCount === 1 ? 'sesión cumplida' : 'sesiones cumplidas'} esta semana`
            : 'Sin sesiones esta semana'}
          {lastDoneDate ? ` · última el ${formatWeekday(lastDoneDate)}` : ' · ninguna en los últimos 30 días'}
        </span>
```

- [ ] **Step 3:** botón saltar (después de "Pausar esta meta"):

```tsx
        <button
          className="btn--link"
          style={{ alignSelf: 'center' }}
          disabled={working}
          onClick={() => {
            setSkipped((n) => n + 1)
            setIndex((i) => i + 1)
          }}
        >
          Saltar por ahora
        </button>
```

- [ ] **Step 4:** pantalla final — copy consciente de los saltos:

```tsx
          <p className="muted">
            Repasaste {total - skipped} de {total} {total === 1 ? 'meta' : 'metas'}. Así se mantiene el rumbo.
          </p>
```

y en `chips` agregar: `skipped > 0 && `${skipped} para después``.

- [ ] **Step 5:** typecheck + tests → commit `feat(revision): saltar una meta y contexto de sesiones para decidir con datos`

---

### Task 9: Hint de primera vez para "parcial" (#15)

**Files:** Modify `src/screens/Today.tsx`.

- [ ] **Step 1:** import `Hint` de `@/components/Hint`. En la sección "Tus sesiones de hoy", tras el `section-head`:

```tsx
              {todaySessions.some((x) => x.session.status === 'partial') && (
                <Hint id="session-partial-2026-06">
                  Una sesión <strong>parcial</strong> cuenta lo que hiciste y no rompe tu racha. Puedes
                  retomarla para completarla.
                </Hint>
              )}
```

- [ ] **Step 2:** typecheck + tests → commit `feat(hoy): primer "parcial" se explica solo con un hint de una vez`

---

### Task 10: Actualizar mejoras-frescas.md con el resultado

**Files:** Modify `docs/analisis/mejoras-frescas.md`.

- [ ] **Step 1:** marcar #2 y #6 como "descartada al verificar" con la razón; marcar el resto como ✅ aplicadas (commit). Añadir nota del bug extra de GoalCreated. Commit `docs(analisis): estado final de las mejoras frescas — 13 aplicadas, 2 descartadas al verificar`

## Self-review

- Cobertura: 13 mejoras válidas → Tasks 1-9; #12/#13/#11 agrupadas (misma pantalla). Invalidadas documentadas (Task 10). Bug extra de ruta incluido (Task 1).
- Tipos: `onAuthChange(cb(user, event))` solo lo consume useAuth (verificado por grep). `TargetKind` ya se importa en CommitmentStep. `Session` se importa en Review (nuevo). `profile` disponible vía useSession en Calendar.
- Sin placeholders: cada paso lleva su código.
