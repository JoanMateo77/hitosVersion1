# Dieta de información — Fase 3 (Progreso, Hábitos, Perfil, Sesión, Revisión) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar la dieta de información (§3 del spec) a las cinco pantallas restantes: lo que se hace hoy y su estado queda visible; historia, metadatos y explicaciones se pliegan con `Disclosure` o se muestran una sola vez.

**Architecture:** Solo UI: cada pantalla se poda en su propio archivo reutilizando `Disclosure` (Fase 2) y `Hint` (existente). Sin lógica nueva de dominio, sin cambios de servicios ni de esquema.

**Tech Stack:** React 19 + TypeScript estricto (`noUnusedLocals`) + Vite 6, CSS propio con tokens. Vitest no cambia (no hay lógica nueva).

**Spec:** `docs/superpowers/specs/2026-09-09-agenda-bloques-dieta-informacion-design.md` (§3, §5.6, §5.7, §7, §8).

## Global Constraints

- Copy en español neutro profesional con tuteo; nunca voseo.
- Cada dato una vez por pantalla; historia, metadatos y explicaciones plegados o una sola vez (§3).
- `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` en verde al cerrar cada tarea; al quitar un uso, quitar el import/estado huérfano (sin `eslint-disable`).
- Estilos solo con tokens; nada de CSS nuevo salvo lo indicado.
- No tocar formularios ni hojas más allá de lo listado (`TimesEditor` solo pierde sus textos explicativos).
- Nunca incluir `Co-Authored-By` ni atribución a Claude en los commits.
- Rama: `feat/dieta-fase3`, creada desde `feat/dieta-fase2`.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/screens/Progress.tsx` (modificar) | Sin leyenda; 8 semanas plegadas y sin pie; sin "invertidas" por meta; sin tag de meta en hábitos; camino 5 + "Ver más". |
| `src/screens/Habits.tsx` (modificar) | Ideas solo en vacío (si no, plegadas); pauta sin horas; meta vinculada al menú ⋯; una sola explicación en el formulario. |
| `src/screens/Profile.tsx` (modificar) | Marco actual visible, galería y explicación plegadas; instalación en iPhone plegada; sin hints ni pie. |
| `src/screens/SessionRun.tsx` (modificar) | Plan plegado ("Plan · X de Y"), sugerencia solo antes de empezar, etapa en el kicker, "no pude" como `Hint`. |
| `src/screens/Review.tsx` (modificar) | Etapa actual → siguiente en texto; una cifra de la semana; porqué plegado. |

---

### Task 1: Progreso

**Files:**
- Modify: `src/screens/Progress.tsx`

- [ ] **Step 1: Leyenda fuera** — borrar el `<p className="faint tiny" style={{ marginTop: 4 }}>Verde: cumplido · ámbar: parcial · punteado: por venir</p>` (cada día ya lleva `aria-label` con su estado; añadir además `title={…}` con el mismo texto del `aria-label` al `div` de cada día para que en escritorio se vea al pasar el mouse).

- [ ] **Step 2: Sin "invertidas" por meta** — en la tarjeta de cada meta quitar `{minutes > 0 ? ` · ${formatDuration(minutes)} invertidas` : ''}`; si `minutes`/`minutesByGoal` y `formatDuration` quedan sin uso, quitarlos (incluida la consulta que alimenta `minutesByGoal`, si solo servía para esto).

- [ ] **Step 3: Sin tag de meta en hábitos** — quitar `{linkedGoal && <span className="tag">{linkedGoal.title}</span>}` y la constante `linkedGoal`.

- [ ] **Step 4: Últimas 8 semanas plegadas** — reemplazar la sección por:

```tsx
      {anyHistory && (
        <section className="card" aria-label="Últimas 8 semanas">
          <Disclosure summary="Últimas 8 semanas">
            <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 56 }}>
              {/* las mismas barras de hoy, sin cambios */}
            </div>
          </Disclosure>
        </section>
      )}
```

  y borrar el `<p className="faint tiny">% de sesiones cumplidas por semana · esta semana: …</p>` (con su comentario). Importar `Disclosure` de `@/components/Disclosure`.

- [ ] **Step 5: Tu camino, 5 + "Ver más"** — cambiar `const timeline = entries.slice(0, 12)` por `const timeline = entries` y renderizar:

```tsx
        <>
          <TimelineList entries={timeline.slice(0, 5)} />
          {timeline.length > 5 && (
            <Disclosure summary={`Ver más (${timeline.length - 5})`}>
              <TimelineList entries={timeline.slice(5)} />
            </Disclosure>
          )}
        </>
```

  extrayendo el `<ul className="timeline">…</ul>` actual (con su `navigate`) a un componente local `TimelineList({ entries })` definido en el mismo archivo (necesita `useNavigate` dentro, o recibir `onOpen(goalId)` por prop). Mover el tipo `Entry` fuera del componente para poder tiparlo.

- [ ] **Step 6: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add src/screens/Progress.tsx
git commit -m "feat(progreso): sin leyenda ni pies; historial y camino largo plegados"
```

---

### Task 2: Hábitos

**Files:**
- Modify: `src/screens/Habits.tsx`

- [ ] **Step 1: Pauta sin horas** — reemplazar `pautaLabel`:

```ts
/** "Todos los días", "Lun, Mié y Vie · 3 veces al día": días y repeticiones; las horas viven en el menú. */
function pautaLabel(habit: Habit): string {
  const base = daysLabel(habit.weekdays)
  const n = habit.times?.length ?? 0
  return n > 1 ? `${base} · ${n} veces al día` : base
}
```

  (si `formatTime12` queda sin uso en el archivo, quitar el import).

- [ ] **Step 2: Meta vinculada al menú** — en la fila del hábito quitar el `<span className="tag"><IconArrowReturn … /> {goal.title}</span>`; dentro de `{menuId === habit.id && (<div className="stack stack--sm">…` el menú ya tiene la sección de meta (chips): no hace falta agregar nada más. Si `IconArrowReturn` queda sin uso, quitar el import.

- [ ] **Step 3: Una sola explicación en el formulario** — borrar: en `TimesEditor` los dos `<p className="faint tiny">` (el de "Una vez al día, sin hora fija…" y el de "1 vez al día. Cada momento…/N veces al día…"); en el formulario el `<p>` de "Sin días marcados, el hábito aplica todos los días." y el de "El hábito aparece en el detalle de su meta…". Agregar una sola línea justo antes de la fila de botones Crear/Cancelar del formulario:

```tsx
          <p className="faint tiny" style={{ margin: 0 }}>
            Sin días marcados aplica todos los días; cada hora que agregues es una repetición.
          </p>
```

- [ ] **Step 4: Ideas populares** — envolver la sección: si `active.length === 0` se muestra como hoy; si hay hábitos, plegada:

```tsx
          {active.length === 0 ? (
            <section className="stack stack--sm" style={{ marginTop: 'var(--s5)' }}>
              {/* igual que hoy */}
            </section>
          ) : (
            <Disclosure summary="Ideas para sumar" className="mt-5">
              <div className="row wrap">{/* los mismos chips */}</div>
            </Disclosure>
          )}
```

  (`mt-5`: si no existe una utilidad así, usar `style={{ marginTop: 'var(--s5)' }}` en un `div` envolvente). Importar `Disclosure`.

- [ ] **Step 5: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add src/screens/Habits.tsx
git commit -m "feat(habitos): pauta breve, meta en el menú, ideas plegadas y una sola explicación"
```

---

### Task 3: Perfil

**Files:**
- Modify: `src/screens/Profile.tsx`

- [ ] **Step 1: Tu marco** — dejar visible el `<p className="small">Racha actual: … marco …</p>` y mover la galería `FRAMES` y el párrafo explicativo dentro de `<Disclosure summary="Cómo se ganan los marcos">…</Disclosure>`.

- [ ] **Step 2: Instalación en iPhone plegada** — en la rama `push === 'unsupported'` dejar una línea visible `<p className="small muted" style={{ margin: 0 }}>Este navegador no permite notificaciones.</p>` y mover los dos párrafos actuales dentro de `<Disclosure summary="¿Cómo activarlos en iPhone?">`.

- [ ] **Step 3: Hints y pie** — borrar `<span className="field__hint">Sugiere la hora de tus sesiones nuevas.</span>`, `<span className="field__hint">El punto de partida al comprometer días nuevos.</span>` y el `<p className="faint tiny center" …>Lógralo es gratis…</p>` del final.

- [ ] **Step 4: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add src/screens/Profile.tsx
git commit -m "feat(perfil): marco actual a la vista, galería e instalación plegadas, sin hints"
```

---

### Task 4: Sesión en curso

**Files:**
- Modify: `src/screens/SessionRun.tsx`

- [ ] **Step 1: Etapa en el kicker; fuera "Estás construyendo"** — el kicker pasa a:

```tsx
        <span className="kicker row row--sm" style={{ alignItems: 'center' }}>
          <NicheGlyph area={goal.area} size="sm" />
          {goal.title} · {targetLabel}
          {milestones.length > 0 && currentMilestone && (
            <> · Etapa {milestones.filter((m) => m.doneAt !== null).length + 1} de {milestones.length}</>
          )}
        </span>
```

  y se borra el bloque `{currentMilestone && (<div className="focus-card stack" …>Estás construyendo…</div>)}`.

- [ ] **Step 2: Sugerencia solo antes de empezar** — el `<span className="tag" …><IconLightbulb size={13} /> {suggestion}</span>` se envuelve en `{session.status === 'pending' && (…)}`.

- [ ] **Step 3: Plan plegado** — reemplazar la `<section className="session-plan">` por una versión donde la cabecera es el resumen de un `Disclosure` y el formulario vive dentro:

```tsx
          <section className="session-plan" aria-label="El plan de esta sesión">
            <Disclosure
              summary={`Plan${planItems.length > 0 ? ` · ${planItems.filter((e) => e.doneAt !== null).length} de ${planItems.length}` : ''}`}
              defaultOpen={session.status !== 'running'}
            >
              {planNotice && (<div className="alert alert--warn" role="alert">{planNotice}</div>)}
              <ul className="session-plan__list">{/* igual que hoy */}</ul>
              {!closed && (<form className="session-plan__add" …>{/* igual que hoy */}</form>)}
            </Disclosure>
          </section>
```

  Borrar `<header className="session-plan__head">…</header>` y, en `src/styles/session-plan.css`, las reglas `.session-plan__head`, `.session-plan__title`, `.session-plan__count` si quedan sin uso.

- [ ] **Step 4: "No pude" una sola vez** — en `ResolutionOptions` reemplazar `<p className="faint tiny center">Decir “no pude” no rompe nada: mañana se empieza de nuevo.</p>` por `<Hint id="session-no-pude-2026-09">Decir “no pude” no rompe nada: mañana se empieza de nuevo.</Hint>` (importar `Hint` de `@/components/Hint`).

- [ ] **Step 5: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add src/screens/SessionRun.tsx src/styles/session-plan.css
git commit -m "feat(sesion): plan plegado, sugerencia solo al inicio y etapa en el kicker"
```

---

### Task 5: Revisión guiada

**Files:**
- Modify: `src/screens/Review.tsx`

- [ ] **Step 1: Etapa actual → siguiente en texto** — reemplazar `<Roadmap milestones={milestones} currentIndex={stage} />` por:

```tsx
        {milestones.length > 0 && stage < milestones.length && (
          <p style={{ margin: 0 }}>
            <strong>{milestones[stage]}</strong>
            {milestones[stage + 1] && (
              <span className="muted"> → {milestones[stage + 1]}</span>
            )}
          </p>
        )}
```

  y quitar el import de `Roadmap` (sigue usándose en `GoalCreated.tsx`; no borrar el componente).

- [ ] **Step 2: Una cifra de la semana** — el `<span className="faint tiny">` de contexto queda solo con `{weekCount > 0 ? `${weekCount} ${weekCount === 1 ? 'sesión cumplida' : 'sesiones cumplidas'} esta semana` : 'Sin sesiones esta semana'}`; quitar `lastDoneDate` y `habitDaysDone` (y `formatWeekday`, `linkedHabits`… solo si quedan sin uso).

- [ ] **Step 3: Porqué plegado** — reemplazar `{goal.why && <p className="screen__subtitle">Tu porqué: {goal.why}</p>}` por:

```tsx
        {goal.why && (
          <Disclosure summary="Tu porqué">
            <p className="small muted" style={{ margin: 0 }}>{goal.why}</p>
          </Disclosure>
        )}
```

- [ ] **Step 4: Gates y commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
```bash
git add src/screens/Review.tsx
git commit -m "feat(revision): etapa actual y siguiente en texto, una cifra y porqué plegado"
```

---

### Task 6: Cierre de fase

- [ ] **Step 1:** `grep -rn "Estás construyendo\|Verde: cumplido\|invertidas\|Lógralo es gratis\|El punto de partida al comprometer\|Sugiere la hora de tus sesiones" src/screens src/components` → sin coincidencias (salvo `invertidas` en `GoalDetail.tsx`, que sigue siendo válido).
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build`; detector una vez: `node .claude/skills/impeccable/scripts/detect.mjs --json src/screens/Progress.tsx src/screens/Habits.tsx src/screens/Profile.tsx src/screens/SessionRun.tsx src/screens/Review.tsx src/styles/session-plan.css`.
- [ ] **Step 3:** Verificación visual con sesión iniciada (pendiente para el usuario si no la hay).

---

## Auto-revisión del plan

- **Cobertura §5.6:** Progreso (leyenda, 8 semanas, pie, invertidas, tag de meta, camino 5) → T1; Hábitos (ideas, pauta, tag de meta, explicaciones) → T2; Perfil (marcos, iPhone, hints, pie) → T3; Sesión (plan, sugerencia, "Estás construyendo", no pude) → T4; Revisión (camino, línea triple, porqué) → T5.
- **Decisiones registradas:** el porqué en Revisión se pliega con `Disclosure` (misma gramática que el resto) en lugar de "una línea con más"; el kicker de Sesión muestra "Etapa N de M" (el título de la etapa se lee en el detalle de la meta); las ideas de hábitos plegadas llevan el resumen "Ideas para sumar".
- **Sin placeholders; sin lógica nueva que testear.**
