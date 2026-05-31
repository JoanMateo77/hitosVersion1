# Pase de arreglos — Tier 1 (alta severidad) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los hallazgos 🔴 de alta severidad de la auditoría (accesibilidad base, integridad de datos, y destrabar al usuario) sin tocar la capa de IA.

**Architecture:** App React 19 + Vite + Supabase. Tres commits temáticos directo a `master`, en orden: `fix(a11y)` → `fix(data)` → `fix(ux)`. Cada commit deja `tsc` + tests + build en verde.

**Tech Stack:** React 19, react-router-dom 7, TypeScript, Vitest, Supabase JS.

**Fuente:** `docs/superpowers/specs/2026-05-29-arreglos-auditoria-design.md` (§A, §B) y `AUDITORIA.md`.

> **🛡️ Endurecido al 31/05 (verificación multi-agente: grounding + calidad).** Cada tarea lleva un bloque `✅ Verificado` con: anchors re-anclados **por texto** (resisten el drift de líneas), hazards a preservar, coordinación entre tareas que tocan el mismo archivo, y mejoras de calidad que pasaron un crítico anti-gold-plating. **Regla de oro para el ejecutor: anclá por texto/símbolo, no por número de línea** — varias tareas corren la numeración de archivos compartidos (`GoalDetail.tsx`: T3/T11/T13/T14 · `Wizard.tsx`: T4/T9/T15 · `Profile.tsx`: T5/T16 · `Auth.tsx`: T2/T17). Los `git add` de los 3 commits se verificaron contra el árbol real; el conteo de tests base es 41.

## Falsos positivos verificados (NO se tocan)
- **`aria-current` en NavLink:** `react-router@7.15.1` ya aplica `aria-current="page"` al link activo automáticamente (`NavLink` default `ariaCurrentProp="page"`). No se agrega nada en SideNav/BottomNav.

---

## COMMIT 1 — `fix(a11y): landmark, skip-link, live regions, labels y toggles`

### Task 1: Landmark `<main>` + skip-link en el shell

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** `export function AppShell()` (estructura real coincide con el snippet).
> - **⚠ Preservar:** aplicar el cambio **editando solo el JSX del `return`** — NO pegar el snippet como reemplazo de archivo: conservar los imports (líneas 1-4) y el JSDoc (6-11) que el snippet omite, o se rompe el build.
> - **Calidad (must):** en el CSS del skip-link usar `color: var(--on-primary)` (no `--bg`; `--on-primary` es el token de contraste ya usado por `.btn--primary`). Agregar al `:focus-visible` del skip-link `outline-color: var(--on-primary); outline-offset: -3px` — si no, el ring global `var(--primary)` queda invisible sobre el fondo primary (mismo fix que `.btn--primary:focus-visible`).
> - **nice:** NO agregar `@media prefers-reduced-motion` propio (`base.css:169` ya lo cubre global); mantener `:focus-visible` (no `:focus`).

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/styles/components.css` (agregar `.skip-link` al final)

- [ ] **Step 1: Editar AppShell** — envolver el contenido en `<main>` y agregar el skip-link como primer hijo del shell.

```tsx
export function AppShell() {
  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <SideNav />
      <div className="shell__main">
        <TopBar />
        <main id="contenido" className="shell__content">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 2: Agregar CSS del skip-link** al final de `src/styles/components.css`.

```css
/* Skip-link: oculto hasta recibir foco por teclado. */
.skip-link {
  position: absolute;
  left: var(--s3);
  top: -56px;
  z-index: 1000;
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--primary);
  color: var(--bg);
  font-size: var(--fs-sm);
  text-decoration: none;
  transition: top 0.15s ease;
}
.skip-link:focus-visible { top: var(--s3); }
```

- [ ] **Step 3: Verificar** — `npm run typecheck` (sin errores). Manual: al cargar `/`, presionar `Tab` una vez muestra "Saltar al contenido"; `Enter` mueve el foco al contenido.

### Task 2: `role`/`aria-live` en contenedores de error y aviso

> **✅ Verificado al 31/05 + calidad**
> - **Anchors:** `Auth.tsx:143-148`, `GoalSuggestions.tsx:92`, `Review.tsx:128`, `Today.tsx:545-549` — todos exactos.
> - **⚠ Preservar:** al reescribir el bloque `notice` de Auth conservar `style={{ background: 'var(--success-soft)', color: 'var(--success)' }}`; en Today conservar `style={{ marginTop: 'var(--s3)' }}`.
> - **Calidad (must):** el aviso `role="status"` debe llevar también `aria-live="polite"` (es el patrón del resto del codebase).
> - **nice:** NO agregar `aria-live="assertive"` al error — `role="alert"` ya lo implica.

**Files:**
- Modify: `src/screens/Auth.tsx:143-148`
- Modify: `src/screens/GoalSuggestions.tsx:92`
- Modify: `src/screens/Review.tsx:128`
- Modify: `src/screens/Today.tsx:545-549`

- [ ] **Step 1: Auth** — agregar `role` a error y aviso.

```tsx
{error && <div className="alert alert--error" role="alert">{error}</div>}
{notice && (
  <div
    className="alert"
    role="status"
    style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
  >
    {notice}
  </div>
)}
```

- [ ] **Step 2: GoalSuggestions** — `{error && <div className="alert alert--error" role="alert">{error}</div>}`
- [ ] **Step 3: Review** — `{error && <div className="alert alert--error" role="alert">{error}</div>}`
- [ ] **Step 4: Today** — agregar `role="alert"` al bloque `actionError`:

```tsx
{actionError && (
  <div className="alert alert--error" role="alert" style={{ marginTop: 'var(--s3)' }}>
    {actionError}
  </div>
)}
```

- [ ] **Step 5: Verificar** — `npm run typecheck`. Manual con lector de pantalla: forzar un error de login y confirmar que se anuncia.

### Task 3: Labels asociadas en el editor de GoalDetail

> **✅ Verificado al 31/05 + calidad**
> - **Anchor (corregido):** `function GoalEditor(...)` + el primer label `'¿Qué querés lograr?'`. **NO usar líneas 375-443** — `GoalEditor` arranca en 342 y T11/T13/T14 (mismo archivo) corren la numeración. Anclar por texto.
> - **⚠ Preservar:** el wrapper `<div className="stack stack--lg">`, el bloque `{error && ...}` y los botones Guardar/Cancelar (que el snippet omite); la función `submit()` y los `useState`; el botón "Quitar fecha".
> - **Calidad (must):** ids con prefijo de sección (`edit-*`) para evitar colisiones, **sin** `useId` (instancia única; contra la convención de ids estáticos del repo). El grupo de chips de Área usa `aria-labelledby` (correcto) — preservarlo, no homogeneizar a `aria-label`. **NO** extraer un componente `<Field>` (los 5 controles difieren; abstraerlos es gold-plating).

**Files:**
- Modify: `src/screens/GoalDetail.tsx:375-443` (componente `GoalEditor`)

- [ ] **Step 1: Asociar cada label con su control** (id + htmlFor) y agrupar los chips de área.

```tsx
<div className="field">
  <label className="field__label" htmlFor="edit-title">¿Qué querés lograr?</label>
  <input id="edit-title" className="input" value={title}
    onChange={(e) => setTitle(e.target.value)} maxLength={200}
    autoCapitalize="sentences" autoCorrect="on" enterKeyHint="done" inputMode="text" />
</div>
<div className="field">
  <label className="field__label" htmlFor="edit-why">¿Por qué? (opcional)</label>
  <textarea id="edit-why" className="textarea" value={why}
    onChange={(e) => setWhy(e.target.value)} autoCapitalize="sentences" autoCorrect="on" enterKeyHint="enter" />
</div>
<div className="field">
  <label className="field__label" htmlFor="edit-date">¿Para cuándo? (opcional)</label>
  <input id="edit-date" className="input" type="date" min={todayISO()} value={targetDate}
    onChange={(e) => setTargetDate(e.target.value)} />
  {targetDate && (
    <button className="btn--link" type="button" onClick={() => setTargetDate('')}>Quitar fecha</button>
  )}
</div>
<div className="field">
  <span className="field__label" id="edit-area-label">Área</span>
  <div className="row wrap" role="group" aria-labelledby="edit-area-label">
    {NICHES.map((n) => (
      <button key={n.id} type="button"
        className={`chip${area === n.id ? ' chip--selected' : ''}`}
        aria-pressed={area === n.id}
        onClick={() => setArea(n.id)}>
        {n.emoji} {n.label}
      </button>
    ))}
  </div>
</div>
<div className="field">
  <label className="field__label" htmlFor="edit-criteria">Lo logro cuando… (opcional)</label>
  <input id="edit-criteria" className="input" value={criteria}
    onChange={(e) => setCriteria(e.target.value)} maxLength={200}
    autoCapitalize="sentences" autoCorrect="on" enterKeyHint="done" inputMode="text" />
</div>
```

- [ ] **Step 2: Verificar** — `npm run typecheck`. Manual: tocar el texto de cada label enfoca su input.

### Task 4: Labels accesibles en el Wizard

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** `{step === 0 && (<Question title="¿Qué querés lograr?"` (anclar por paso, no por línea).
> - **⚠ Preservar:** al agregar `aria-label`/`role=group` NO perder los atributos existentes de cada control (`autoFocus`, `enterKeyHint`, `autoCapitalize`, `maxLength`, `inputMode`, `onKeyDown`) ni el `key`/`onClick`/`className` de los chips.
> - **Calidad (must):** confirmar que los chips de Área llevan `aria-pressed`.
> - **nice:** opción de asociar con el `<h1>` visible vía `aria-labelledby` en vez de duplicar el texto. *(Mantener `aria-label` string también es válido — es el patrón real del codebase, ThemeSwitcher.)*
> - **Coordinación:** `Wizard.tsx` lo tocan también T15 (estado) y T9 (catch de `submit`).

**Files:**
- Modify: `src/screens/Wizard.tsx` (inputs de los pasos 0, 2, 4, 5)

- [ ] **Step 1: Dar nombre accesible a cada control** vía `aria-label` (el `<h1>` de cada paso es el título visible; lo enlazamos).

Paso 0 (título), agregar al `<input>`: `aria-label="¿Qué querés lograr?"`
Paso 2 (porqué), agregar al `<textarea>`: `aria-label="¿Por qué querés lograrlo?"`
Paso 5 (criterio), agregar al `<input>`: `aria-label="¿Cómo vas a saber que lo lograste?"`

Paso 4 (área), envolver los chips:

```tsx
<div className="row wrap" role="group" aria-label="¿En qué área de tu vida cae?">
  {NICHES.map((n) => (
    <button key={n.id} type="button"
      className={`chip${area === n.id ? ' chip--selected' : ''}`}
      aria-pressed={area === n.id}
      onClick={() => setArea(n.id)}>
      {n.emoji} {n.label}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Verificar** — `npm run typecheck`. Manual: navegar el wizard con teclado y confirmar que cada campo se anuncia con su pregunta.

### Task 5: `aria-pressed`/`role=group` en toggles de Profile y Calendar

> **✅ Verificado al 31/05 + calidad**
> - **Anchors:** Profile segmented `'¿Cómo querés trabajar?'` (~121) y chips `'Tu foco principal'` (~146); Calendar `:189-197` y `:455-468`.
> - **Calidad (must):** usar `role="group"` + `aria-label` (patrón real del codebase, ThemeSwitcher), **no** `aria-labelledby` con id nuevo. Marcar el emoji del chip `aria-hidden`. En Calendar **editar in-place** los `.map` existentes (sin reescribir, sin perder `key`); derivar `aria-pressed` de `allDay`/`!allDay` sin tocar los inputs date/time vecinos.
> - **⚠ Coordinación con T16 (mismo bloque de chips):** el snippet de Step 2 **borra silenciosamente** el `.filter((n) => n.id !== 'otra')`. Eso es responsabilidad de **T16**. En T5 **PRESERVAR el `.filter`** y el contenido real del `field__hint` (la ternaria, no el placeholder). El borrado del filter se hace una sola vez, en T16.

**Files:**
- Modify: `src/screens/Profile.tsx:120-159`
- Modify: `src/screens/Calendar.tsx:189-197` (selector de vista) y `:455-468` (toggle Todo el día / Con horario)

- [ ] **Step 1: Profile — segmented control "¿Cómo querés trabajar?"**

```tsx
<div className="field">
  <span className="field__label" id="focus-label">¿Cómo querés trabajar?</span>
  <div className="seg" role="group" aria-labelledby="focus-label" style={{ alignSelf: 'flex-start' }}>
    <button type="button"
      className={`seg__btn${focusMode === 'single' ? ' seg__btn--active' : ''}`}
      aria-pressed={focusMode === 'single'}
      onClick={() => setFocusMode('single')}>Una meta</button>
    <button type="button"
      className={`seg__btn${focusMode === 'multi' ? ' seg__btn--active' : ''}`}
      aria-pressed={focusMode === 'multi'}
      onClick={() => setFocusMode('multi')}>Varias metas</button>
  </div>
  <span className="field__hint">{/* …igual que ahora… */}</span>
</div>
```

- [ ] **Step 2: Profile — chips de nicho** (también arregla `role=group`):

```tsx
<div className="field">
  <span className="field__label" id="niche-label">Tu foco principal</span>
  <div className="row wrap" role="group" aria-labelledby="niche-label">
    {NICHES.map((n) => (
      <button key={n.id} type="button"
        className={`chip${niche === n.id ? ' chip--selected' : ''}`}
        aria-pressed={niche === n.id}
        onClick={() => setNiche(n.id)}>
        {n.emoji} {n.label}
      </button>
    ))}
  </div>
</div>
```
> Nota: el `.filter((n) => n.id !== 'otra')` se elimina acá — eso es la Task 11 (nicho 'otra' seleccionable). Si se hace la Task 11 primero, este bloque ya itera sobre `NICHES` completo.

- [ ] **Step 3: Calendar** — abrir `src/screens/Calendar.tsx`, en el selector de vista (`:189-197`) y en el toggle Todo-el-día/Con-horario (`:455-468`), agregar a cada `<button className="seg__btn…">` el atributo `aria-pressed={<misma condición que la clave --active>}` y envolver cada grupo en `role="group"` con un `aria-label` descriptivo ("Vista del calendario" y "Tipo de evento"). Mismo patrón que el Step 1.

- [ ] **Step 4: Verificar** — `npm run typecheck`. Manual: con lector de pantalla, cada toggle anuncia su estado presionado.

### Task 6: Deshabilitar filas y `aria-busy` al adoptar en GoalSuggestions

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** `export function OptionRow`.
> - **⚠ Preservar:** el JSX interno del `<button>` que el snippet abrevia con `{/* …resto igual… */}`; el `map` envolvente de `GoalSuggestions` (77-79).
> - **Calidad (must):** mantener `disabled` y `busy` como props **independientes** (no derivar una de otra) — es el diseño reusable correcto (3 pantallas lo usan). La simplificación del `onClick` (quitar el guard `if(adopting===null)`) es segura: `disabled` ya bloquea el click.
> - **nice:** `aria-busy` en un botón `disabled` casi no lo anuncian las AT; el estado real lo da el texto "Creando…".

**Files:**
- Modify: `src/components/OptionRow.tsx`
- Modify: `src/screens/GoalSuggestions.tsx:77-90`

- [ ] **Step 1: Agregar props `disabled` y `busy` a OptionRow.**

```tsx
interface OptionRowProps {
  emoji?: string
  label: string
  desc?: string
  selected?: boolean
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}

export function OptionRow({ emoji, label, desc, selected = false, disabled = false, busy = false, onClick }: OptionRowProps) {
  return (
    <button
      type="button"
      className={`option${selected ? ' option--selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-busy={busy || undefined}
    >
      {/* …resto igual… */}
    </button>
  )
}
```

- [ ] **Step 2: Usar las props en GoalSuggestions** (y simplificar el onClick: `disabled` ya bloquea).

```tsx
<OptionRow
  key={seed.title}
  emoji={template.emoji}
  label={seed.title}
  desc={adopting === seed.title ? 'Creando…' : template.label}
  disabled={adopting !== null}
  busy={adopting === seed.title}
  onClick={() => void adopt(seed)}
/>
```

- [ ] **Step 3: Verificar** — `npm run typecheck` + `npm run build`. Manual: al adoptar, todas las filas se ven deshabilitadas y la fila activa muestra estado de carga.

### Task 7: Commit del Tier 1 a11y

- [ ] **Step 1: Correr la suite completa** — `npm run typecheck && npm run test && npm run build`. Esperado: 0 errores de tipo, 41 tests verdes, build OK.
- [ ] **Step 2: Commit.**

```bash
git add src/components/AppShell.tsx src/components/OptionRow.tsx src/styles/components.css \
  src/screens/Auth.tsx src/screens/GoalSuggestions.tsx src/screens/Review.tsx \
  src/screens/Today.tsx src/screens/GoalDetail.tsx src/screens/Wizard.tsx \
  src/screens/Profile.tsx src/screens/Calendar.tsx
git commit -m "fix(a11y): landmark + skip-link, live regions, labels y toggles accesibles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## COMMIT 2 — `fix(data): no romper el plan en silencio`

### Task 8: Revisión semanal usa `goalsDueForReview`

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** poner el import junto al de `@/domain/dailyPlan` (no pegado al de servicios, línea 5).
> - **⚠ Preservar:** íntegros el `.catch` (37-41) y el `return` de cleanup (42-44) del `useEffect`.
> - **Calidad (must):** `goalsDueForReview(goals, now?)` ya filtra `status==='active'` internamente → llamarla con **un solo arg** `goalsDueForReview(gs)` (igual que Today.tsx) y no duplicar el filtro. Corregir el copy del empty-state: ya no es "no tenés metas activas" sino "nada para revisar hoy".

**Files:**
- Modify: `src/screens/Review.tsx:5,32-34`

- [ ] **Step 1: Importar la función de dominio.** En la línea de import de servicios/dominio agregar:

```tsx
import { goalsDueForReview } from '@/domain/dailyPlan'
```

- [ ] **Step 2: Filtrar por "lo que toca revisar", no por todas las activas.**

```tsx
listGoals(userId)
  .then((gs) => {
    if (!active) return
    setGoals(goalsDueForReview(gs))
    setLoading(false)
  })
```

- [ ] **Step 3: Verificar** — `npm run typecheck`. Manual: si el banner de Today dice "N metas para revisar", Review recorre exactamente N (no todas las activas).

### Task 9: Distinguir error duplicado vs. real (no tragarse fallos)

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** `export function isUniqueViolation`; `errors.ts` no existe aún (net-new, correcto).
> - **⚠ Preservar:** el catch real de Wizard es `} catch { ... }` **sin binding** → al pasar a `catch (err)` agregar el import `isUniqueViolation`. Agregar el import en **ambas** pantallas (el snippet lo dice en prosa, no en código).
> - **Calidad (must):** agregar un test con la **forma real** que lanza `createGoalTasks`: `Object.assign(new Error('...'), { code: '23505' })`. Agregar el test negativo de un mensaje *parecido* que NO debe matchear. **NO** extraer un helper compartido para los dos catches (3 líneas no justifican abstracción + acopla archivos que tocan T4/T6/T15).
> - **nice:** unificar el comentario del catch en ambas pantallas; ordenar imports del test (`describe, expect, it`).

**Files:**
- Create: `src/lib/errors.ts`
- Create: `src/lib/errors.test.ts`
- Modify: `src/services/tasks.ts:75-77` (preservar el `code`)
- Modify: `src/screens/Wizard.tsx:64-70`
- Modify: `src/screens/GoalSuggestions.tsx:48-54`

- [ ] **Step 1: Escribir el test que falla** en `src/lib/errors.test.ts`.

```ts
import { describe, it, expect } from 'vitest'
import { isUniqueViolation } from '@/lib/errors'

describe('isUniqueViolation', () => {
  it('reconoce el código 23505 de Postgres', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })
  it('reconoce el mensaje de clave duplicada', () => {
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint'))).toBe(true)
  })
  it('NO marca otros errores como duplicado', () => {
    expect(isUniqueViolation({ code: '42501' })).toBe(false) // RLS
    expect(isUniqueViolation(new Error('network error'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla** — `npx vitest run src/lib/errors.test.ts`. Esperado: FAIL ("Cannot find module '@/lib/errors'").

- [ ] **Step 3: Implementar** `src/lib/errors.ts`.

```ts
/** ¿El error corresponde a una violación de unicidad de Postgres (23505)? */
export function isUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  if (code === '23505') return true
  const message = (err as { message?: unknown }).message
  return typeof message === 'string' && message.toLowerCase().includes('duplicate key value')
}
```

- [ ] **Step 4: Correr el test y verificar que pasa** — `npx vitest run src/lib/errors.test.ts`. Esperado: PASS (3 tests).

- [ ] **Step 5: Preservar el `code` en `createGoalTasks`** (`tasks.ts`), para poder distinguir el duplicado.

```ts
const { data, error } = await supabase.from('tasks').insert(rows).select('*')
if (error) throw Object.assign(new Error(error.message), { code: error.code })
return (data as TaskRow[]).map(mapTask)
```

- [ ] **Step 6: Wizard — re-lanzar errores reales** (`Wizard.tsx`). Importar `import { isUniqueViolation } from '@/lib/errors'` y cambiar el catch interno:

```tsx
try {
  await createGoalTasks(userId, todayISO(), [
    { goalId: goal.id, title: pickAction(goal, todayISO()) },
  ])
} catch (err) {
  // Solo ignoramos el duplicado (ya existía la acción de hoy); el resto sube.
  if (!isUniqueViolation(err)) throw err
}
```

- [ ] **Step 7: GoalSuggestions — idem.** Importar `isUniqueViolation` y cambiar el catch interno:

```tsx
try {
  await createGoalTasks(userId, todayISO(), [
    { goalId: goal.id, title: pickAction(goal, todayISO()) },
  ])
} catch (err) {
  if (!isUniqueViolation(err)) throw err
}
```

- [ ] **Step 8: Verificar** — `npm run typecheck && npx vitest run`. Manual: simular fallo de red al crear meta → ahora muestra el error en vez de mentir "creada".

### Task 10: Rollback de mutaciones optimistas en Today

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** `async function withErrorHandling(fn: () => Promise<void>)`.
> - **⚠ Preservar:** `toggle`/`editTask` se reescriben enteras → conservar el bloque de `cheer`/conteos (≈215-221) y el `patchTask` optimista; conservar `setActionError(null)` y el mensaje de fallback exacto. La nueva firma afecta las OTRAS llamadas (`removeTask`, `acceptForgotten`, `addTask`…) — siguen compilando (2º param opcional), no tocarlas.
> - **Calidad (nice):** nombrar el 2º parámetro `rollback` en vez de `onError` (intención, no mecanismo).

**Files:**
- Modify: `src/screens/Today.tsx:202-233`

- [ ] **Step 1: Que `withErrorHandling` acepte un rollback opcional.**

```tsx
async function withErrorHandling(fn: () => Promise<void>, onError?: () => void) {
  setActionError(null)
  try {
    await fn()
  } catch (err) {
    onError?.()
    setActionError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.')
  }
}
```

- [ ] **Step 2: `toggle` revierte el estado previo en error.**

```tsx
function toggle(task: Task) {
  const prevStatus = task.status
  const wasPending = task.status !== 'done'
  const nextStatus: TaskStatus = wasPending ? 'done' : 'pending'
  patchTask(task.id, { status: nextStatus }) // optimista
  if (wasPending) {
    const currentlyDone = visibleTasks.filter((t) => t.status === 'done').length
    const total = visibleTasks.length
    const willBeDone = currentlyDone + 1
    if (willBeDone === 1 && total > 0) cheer('Ese es el hito de hoy.')
    else if (willBeDone === total && total > 1) cheer('Cerraste tu día. Mañana seguimos.')
  }
  void withErrorHandling(
    async () => {
      const updated = await setTaskStatus(task.id, nextStatus)
      patchTask(task.id, updated)
    },
    () => patchTask(task.id, { status: prevStatus }),
  )
}
```

- [ ] **Step 3: `editTask` revierte el título previo en error.**

```tsx
function editTask(task: Task, title: string) {
  const prevTitle = task.title
  patchTask(task.id, { title })
  void withErrorHandling(
    async () => {
      await updateTaskTitle(task.id, title)
    },
    () => patchTask(task.id, { title: prevTitle }),
  )
}
```

- [ ] **Step 4: Verificar** — `npm run typecheck`. Manual: cortar la red, marcar una tarea → vuelve a su estado y aparece el error (no queda "fantasma").

### Task 11: Tiempo por meta honesto (no prometer lo que no se cuenta)

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** string único `'Ligá bloques'` / `{weekMinutes === 0 && (` (no por línea — T3/T13 corren la numeración).
> - **⚠ Preservar:** el `InfoRow` vecino `{weekMinutes > 0 && ...}` y el `{error && ...}` que el snippet no muestra. El único cambio real es el `<strong>con horario</strong>`.
> - **Calidad (must):** que el copy sea honesto — el dato son bloques **agendados**, no "dedicados". *(Descartado por scope-creep: aria-label, guard `!loading`, casts sobre `weekMinutes`.)*

**Files:**
- Modify: `src/screens/GoalDetail.tsx:264-276` (el hint de "Esta semana")

> `minutesByGoalInRange` cuenta solo eventos **con horario** (correcto: un evento de día completo no tiene duración). El bug es que la UI promete "cuánto tiempo le dedicás" sin aclararlo. Fix honesto en Tier 1; el default del editor (que hoy crea día-completo) se ajusta en Tier 2.

- [ ] **Step 1: Aclarar el copy** del hint cuando `weekMinutes === 0`:

```tsx
{weekMinutes === 0 && (
  <p className="faint tiny row row--sm" style={{ alignItems: 'center' }}>
    <IconClock size={14} /> Ligá bloques <strong>con horario</strong> de tu{' '}
    <button className="btn--link" style={{ padding: 0 }} onClick={() => navigate('/calendario')}>
      agenda
    </button>{' '}
    a esta meta y vas a ver acá cuánto tiempo le dedicás por semana.
  </p>
)}
```

- [ ] **Step 2: Verificar** — `npm run typecheck`. Manual: el texto ya no promete contar eventos de día completo.

### Task 12: Commit del Tier 1 data

> **✅ Verificado al 31/05**
> - **Orden:** el `git add` incluye `src/lib/errors.ts` y `errors.test.ts` — se **crean en T9** (mismo COMMIT 2), así que existen al llegar acá. Sólo fallaría si se ejecuta fuera de orden.
> - **Conteo:** 44 tests (41 + 3). Con los tests extra de calidad de T9 (forma real + negativo) serían 45-46 — ajustar el número esperado al real tras correr la suite.

- [ ] **Step 1: Suite completa** — `npm run typecheck && npm run test && npm run build`. Esperado: verde, 44 tests (41 + 3 nuevos).
- [ ] **Step 2: Commit.**

```bash
git add src/lib/errors.ts src/lib/errors.test.ts src/services/tasks.ts \
  src/screens/Review.tsx src/screens/Wizard.tsx src/screens/GoalSuggestions.tsx \
  src/screens/Today.tsx src/screens/GoalDetail.tsx
git commit -m "fix(data): revisión usa metas-due, errores reales no se tragan, rollback optimista y tiempo por meta honesto

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## COMMIT 3 — `fix(ux): destrabar y no regañar`

### Task 13: No mostrar "vencida" en metas logradas/archivadas

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** la línea `const deadline = relativeDeadline(goal.targetDate)` en cada archivo (Goals `GoalCard`; GoalDetail por contenido, no por línea — corre los anchors de T14).
> - **Calidad (must):** extraer un predicado compartido `isGoalClosed(status)` (en domain) en vez de repetir `done || archived` en 4 lugares — **un único booleano**, sin `goalStatusMeta`/registry/hook (sería gold-plating). Confirmar que `'paused'` **sigue** mostrando "vencida" (no ampliar scope a pausadas).

**Files:**
- Modify: `src/screens/Goals.tsx:106`
- Modify: `src/screens/GoalDetail.tsx:161`

- [ ] **Step 1: Goals — guardar el deadline por estado.**

```tsx
const deadline =
  goal.status === 'done' || goal.status === 'archived'
    ? null
    : relativeDeadline(goal.targetDate)
```

- [ ] **Step 2: GoalDetail — idem para la línea relativa** (mantener la fecha absoluta, sacar "vencida").

```tsx
const deadline =
  goal.status === 'done' || goal.status === 'archived'
    ? null
    : relativeDeadline(goal.targetDate)
```

- [ ] **Step 3: Verificar** — `npm run typecheck`. Manual: una meta lograda con fecha pasada ya no dice "vencida hace N días".

### Task 14: Back contextual en GoalDetail

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** hay DOS `<BackButton onClick={() => navigate('/metas')} />` (líneas 135 y 165) — el principal es el que **no** está dentro del `if (!goal)`. Declarar `goBack` dentro del componente (scope de `navigate`).
> - **Calidad (must):** usar `location.key === 'default'` (react-router) para detectar deep-link directo, en vez de `window.history.length` (más fiable en SPA).
> - **nice:** NO aplicar `goBack` al BackButton de "meta no encontrada" (queda como está).

**Files:**
- Modify: `src/screens/GoalDetail.tsx:163-165` (botón principal)

- [ ] **Step 1: Volver al origen real** (Today/Calendar/Goals), con fallback a `/metas`.

```tsx
const goBack = () =>
  window.history.length > 1 ? navigate(-1) : navigate('/metas')
```

Y usarlo en el `<BackButton onClick={goBack} />` de la vista principal (línea 165). El de "meta no encontrada" (135) y el de edición (149) quedan como están.

- [ ] **Step 2: Verificar** — `npm run typecheck`. Manual: entrar al detalle desde Today y tocar Volver → vuelve a Today (no a /metas).

### Task 15: Persistencia de borrador del Wizard

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** `export function Wizard()`.
> - **⚠ Preservar:** entre `createGoalTasks` y `navigate(...)` hay un comentario (l.71) y la variable `goal` de `createGoal` que usa el navigate — al insertar `clearDraft()` no perderlos. El componente tiene también `const [saving]`/`const [error]` junto a los 7 useState que se reescriben.
> - **Calidad (must):** `loadDraft` NO debe confiar ciego en `JSON.parse` → validar el shape antes de devolver. Agregar un type-guard `isNiche` reusando `NICHES` (espejo de `isTheme` en theme.ts). **Sanear `step`** cargado (clamp al rango válido) para que un draft corrupto no rompa el render.
> - **nice:** no persistir un borrador vacío en el mount inicial.
> - **Coordinación:** `Wizard.tsx` lo tocan T4 (a11y) y T9 (catch); aparece en los 3 commits.

**Files:**
- Modify: `src/screens/Wizard.tsx`

- [ ] **Step 1: Helpers de borrador** (arriba del componente `Wizard`).

```tsx
const DRAFT_KEY = 'hito.wizard-draft'

interface WizardDraft {
  step: number; title: string; templateKey: string; why: string
  targetDate: string; area: NicheId; criteria: string
}

function loadDraft(): Partial<WizardDraft> {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}
```

- [ ] **Step 2: Inicializar el estado desde el borrador.**

```tsx
const draft = loadDraft()
const [step, setStep] = useState(draft.step ?? 0)
const [title, setTitle] = useState(draft.title ?? '')
const [templateKey, setTemplateKey] = useState(draft.templateKey ?? '')
const [why, setWhy] = useState(draft.why ?? '')
const [targetDate, setTargetDate] = useState(draft.targetDate ?? '')
const [area, setArea] = useState<NicheId>(draft.area ?? 'otra')
const [criteria, setCriteria] = useState(draft.criteria ?? '')
```

- [ ] **Step 3: Persistir en cada cambio** (agregar el import `useEffect`).

```tsx
useEffect(() => {
  try {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step, title, templateKey, why, targetDate, area, criteria }),
    )
  } catch { /* ignore */ }
}, [step, title, templateKey, why, targetDate, area, criteria])
```

- [ ] **Step 4: Limpiar el borrador al crear con éxito** — en `submit()`, después del `createGoalTasks`, antes de `navigate(...)`:

```tsx
clearDraft()
navigate(`/meta/creada/${goal.id}`, { replace: true })
```

- [ ] **Step 5: Verificar** — `npm run typecheck`. Manual: escribir título + porqué, tocar "ver ideas", volver → los datos siguen ahí; crear la meta → el borrador se limpia.

### Task 16: Nicho 'otra' seleccionable en Profile

> **✅ Verificado al 31/05 + calidad**
> - **Anchor:** string único `NICHES.filter((n) => n.id !== 'otra')` (Profile, `ProfileEditor`).
> - **⚠ Coordinación con T5 (mismo bloque):** la nota del plan dice "Task 11" pero el dueño del borrado es **T16**. Hacer el **cambio mínimo: borrar solo el `.filter`**, sin pegar el snippet completo. NO introducir `aria-pressed`/`role=group` acá (es de T5). Preservar el wrapper `<div className="field">`.
> - **Calidad (must):** NO replicar el cambio en `Onboarding.tsx` — ahí el `.filter('otra')` es intencional.

**Files:**
- Modify: `src/screens/Profile.tsx:148`

- [ ] **Step 1: No filtrar 'otra'** de los chips del editor (así el usuario con foco 'Otra' lo ve seleccionado y no se le fuerza otro).

```tsx
{NICHES.map((n) => (
  <button key={n.id} type="button"
    className={`chip${niche === n.id ? ' chip--selected' : ''}`}
    aria-pressed={niche === n.id}
    onClick={() => setNiche(n.id)}>
    {n.emoji} {n.label}
  </button>
))}
```

- [ ] **Step 2: Verificar** — `npm run typecheck`. Manual: con `primaryNiche='otra'`, abrir el editor → el chip "Otra" aparece seleccionado; guardar no cambia el nicho.

### Task 17: Recuperar contraseña en Auth (cerrar el dead-end)

> **✅ Verificado al 31/05 + calidad**
> - **Anchors:** `function translateAuthError(...)` ya existe (reutilizar). `import { supabase }` ya está en `auth.ts:2` — **no duplicar**. En Auth.tsx **ampliar** el import existente `import { signIn, signUp }` (no crear una 2ª línea).
> - **⚠ Preservar:** `handleSubmit` (18-37) y `switchMode`; insertar el link de reset después del `</div>` del campo contraseña (l.141) y antes del `{error && ...}` (143).
> - **Calidad (must):** el botón de reset (`btn--link`) no encadena con `.btn` → **darle afordancia visual de disabled**. Afinar el copy del email-vacío a voseo claro y conciso (no mezclar instrucción + promesa).
> - **nice:** el bloque `notice` necesita `role`/`aria-live` para que el aviso se anuncie (se coordina con T2).
> - *(Descartado: distinguir "email existe/no existe" rompería el anti-enumeración de Supabase.)*

**Files:**
- Modify: `src/services/auth.ts`
- Modify: `src/screens/Auth.tsx`

- [ ] **Step 1: Servicio `resetPassword`** en `auth.ts`.

```ts
import { supabase } from '@/lib/supabase'

export async function resetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  })
  if (error) throw new Error(translateAuthError(error.message))
}
```
> `translateAuthError` ya existe en `auth.ts`; reutilizarlo.

- [ ] **Step 2: Handler + link en Auth** (solo en modo signin). Importar `resetPassword`.

```tsx
async function handleReset() {
  const target = email.trim()
  if (!target) {
    setError('Escribí tu email arriba y te mandamos el enlace para recuperarla.')
    return
  }
  setError(null)
  setNotice(null)
  setLoading(true)
  try {
    await resetPassword(target)
    setNotice('Te mandamos un email para recuperar tu contraseña. Revisá tu casilla.')
  } catch (err) {
    setError(err instanceof Error ? err.message : 'No se pudo enviar el email.')
  } finally {
    setLoading(false)
  }
}
```

Y, debajo del campo contraseña, solo cuando `!isSignup`:

```tsx
{!isSignup && (
  <button type="button" className="btn--link" style={{ alignSelf: 'flex-end' }}
    onClick={handleReset} disabled={loading}>
    ¿Olvidaste tu contraseña?
  </button>
)}
```

- [ ] **Step 3: Verificar** — `npm run typecheck`. Manual: en signin, sin email → muestra aviso pidiéndolo; con email → muestra "te mandamos un email".

> **Nota de alcance:** esto abre el dead-end (envía el email de recuperación, que reloguea al usuario vía el enlace de Supabase). La **pantalla dedicada para fijar una nueva contraseña** (manejar el evento `PASSWORD_RECOVERY`) es un fast-follow chico; se documenta en el spec del Tier 2 si se quiere el flujo completo de cambio de clave.

### Task 18: Commit del Tier 1 ux

- [ ] **Step 1: Suite completa** — `npm run typecheck && npm run test && npm run build`. Esperado: verde.
- [ ] **Step 2: Commit.**

```bash
git add src/screens/Goals.tsx src/screens/GoalDetail.tsx src/screens/Wizard.tsx \
  src/screens/Profile.tsx src/screens/Auth.tsx src/services/auth.ts
git commit -m "fix(ux): no regañar metas logradas, back contextual, borrador del wizard, nicho otra y reset de contraseña

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (cobertura vs. spec §A/§B)

- ✅ a11y: `<main>`+skip-link (T1), live regions (T2), labels GoalDetail/Wizard (T3,T4), aria-pressed Profile/Calendar (T5), fila disabled+aria-busy GoalSuggestions (T6). `aria-current` = falso positivo verificado (no aplica).
- ✅ data: Review usa goalsDueForReview (T8), catches que distinguen duplicado vs real (T9), rollback optimista (T10), tiempo por meta honesto (T11).
- ✅ ux: "vencida" oculta en done/archived (T13), back contextual (T14), borrador del Wizard (T15), nicho 'otra' (T16), reset de contraseña (T17).
- **Diferido a Tier 2 (documentado):** pantalla de set-new-password (PASSWORD_RECOVERY); default del editor de Calendar para eventos ligados a meta.
- Tipos: `isUniqueViolation(err: unknown): boolean`, `withErrorHandling(fn, onError?)`, `OptionRow` props `disabled`/`busy`, `resetPassword(email: string)` — consistentes entre tareas.
