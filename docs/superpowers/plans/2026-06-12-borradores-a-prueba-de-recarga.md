# Borradores a prueba de recarga — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el último riesgo real del análisis sin revertir la decisión de auto-recarga de la PWA (commit 1ff69d4): que una edición en curso sobreviva la recarga. El Wizard ya lo hace con sessionStorage; faltan el editor de meta (GoalDetail) y el editor de eventos (Agenda). De paso, friendlyError en los errores del EventEditor.

**Architecture:** Helper genérico `lib/formDraft.ts` (load/save/clear sobre sessionStorage, tolerante a fallos — mismo espíritu que wizardDraft). Cada editor persiste su borrador con clave propia (`logralo.goal-edit.{id}`, `logralo.event-edit.{id|new-fecha}`), lo restaura al montar, y lo limpia al guardar con éxito o al cancelar a propósito. La recarga automática NO pasa por cancelar → el borrador sobrevive.

**Verificación:** `npm run typecheck && npm test` por tarea; commit por tarea. ErrorBoundary y Profile se verificaron y ya están bien (auto-recarga con guarda; aria-pressed presente) — no se tocan.

---

### Task U1: helper `formDraft` (TDD)

**Files:** Create `src/lib/formDraft.ts`, `src/lib/formDraft.test.ts`.

- [ ] Test (con mock de sessionStorage en globalThis): guarda y carga un objeto; devuelve null sin valor o con JSON corrupto; clear borra; sin sessionStorage no lanza.
- [ ] Implementación: `loadFormDraft<T>(key): Partial<T> | null`, `saveFormDraft(key, value)`, `clearFormDraft(key)` — todo en try/catch.
- [ ] typecheck + tests → commit `feat(lib): borradores efímeros de formularios en sessionStorage`

### Task U2: editor de meta a prueba de recarga

**Files:** Modify `src/screens/GoalDetail.tsx` (GoalEditor).

- [ ] Clave `logralo.goal-edit.${goal.id}`. Estados iniciales desde el borrador (validando tipo) con fallback a los valores de la meta; el área se valida contra NICHES. Effect que persiste en cada cambio. `clearFormDraft` al guardar con éxito (`.then`) y al cancelar (botón Cancelar y BackButton del modo edición).
- [ ] typecheck + tests → commit `feat(meta): editar una meta sobrevive la recarga automática de la PWA`

### Task U3: editor de eventos a prueba de recarga + errores amables

**Files:** Modify `src/screens/Calendar.tsx` (EventEditor).

- [ ] Clave `logralo.event-edit.${initial?.id ?? 'new-' + date}`. Estados iniciales desde borrador (tipos validados: strings y boolean) con fallback a `initial`. Effect persiste. `close()` que limpia y llama onClose, usado por backdrop, X y focus-trap. Limpiar también al guardar y al borrar con éxito.
- [ ] `friendlyError` en los catch de handleSubmit/handleDelete.
- [ ] typecheck + tests → commit `feat(agenda): el evento a medio escribir sobrevive la recarga — y sus errores hablan claro`

### Task U4: memoria

- [ ] Actualizar `hito-audit-2026-06`: riesgo de PWA cerrado vía borradores; migración 0011 ✅.

## Self-review
- El riesgo de la PWA queda cubierto en sus tres superficies: Wizard (ya existía), GoalEditor y EventEditor. Profile guarda al instante (sin formulario que perder).
- Claves con id → no se cruzan borradores entre metas/eventos distintos.
- Cancelar limpia a propósito; la recarga no cancela → el borrador vuelve al reabrir.
