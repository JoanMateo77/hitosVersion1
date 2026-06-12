# Auditoría de Lógralo — junio 2026

> Auditoría multiagente del 2026-06-12: 5 agentes en paralelo (shell/navegación/Today, ciclo de vida de metas, hábitos/calendario/revisión/aprender, auth/perfil/PWA/datos, e integración entre zonas), contrastando contra AUDITORIA.md (2026-05-29). Los hallazgos de los agentes que contradecían el código actual fueron verificados a mano y descartados si eran falsos (p. ej. el landmark `<main>` y el skip-link YA existen en AppShell.tsx:15-19; el Wizard YA persiste borrador en sessionStorage; la pestaña Hábitos YA está en BottomNav.tsx:13).

## Veredicto global

La app mejoró de forma real desde mayo: de los hallazgos graves de la auditoría anterior, **al menos 12 están arreglados** (rollback en mutaciones optimistas, "Porque porque", Review filtrando solo metas vencidas, skip-link y `<main>`, borrador del Wizard, deadlines en metas cerradas, view-transitions en barras fijas, role="alert" en errores de acción, validación de `?area=` en GoalSuggestions, cierre de sesiones viejas, errores genéricos en español en el Wizard, `resetPassword()` implementado en servicios).

Lo que queda se concentra en tres frentes:
1. **Continuidad rota**: lo no hecho ayer desaparece hoy (sin carryover), la sesión expirada no tiene flujo, y la PWA puede recargar la pestaña a mitad de una edición.
2. **Datos que no cuadran entre pantallas**: Goals y Progress calculan "progreso" con métricas distintas; Calendar sigue con sus bugs de mayo intactos.
3. **Zonas en silo**: Hábitos, Learn y Calendario no conversan con Metas/Progreso/Revisión. Es la mayor oportunidad de producto.

---

## Fallas — severidad ALTA

| # | Falla | Evidencia | Estado |
|---|---|---|---|
| 1 | **Sin carryover de lo no hecho**: las tareas/sesiones pendientes de ayer desaparecen hoy; `listTasksForDate` filtra solo por `plan_date == hoy`. Contradice "guía sin culpa": el usuario ni se entera de que dejó algo a medias. | src/services/tasks.ts:30-39 | Persiste de mayo |
| 2 | **Sesión expirada sin manejo**: todos los servicios lanzan `Error(error.message)` genérico; un 401/403 muestra "No se pudo guardar el cambio" y el usuario reintenta en bucle sin saber que debe volver a entrar. `autoRefreshToken` está activo pero no hay fallback si el refresh falla. | src/services/goals.ts:46-54, tasks.ts:30-38, app/useAuth.ts:22-24 | Nuevo |
| 3 | **Recarga automática de PWA sin aviso**: `registerSW({ immediate: true })` recarga la pestaña al llegar versión nueva. El Wizard está protegido (sessionStorage), pero el editor de GoalDetail, Perfil y el modal de evento del Calendario pierden lo escrito sin aviso. | src/main.tsx:17, vite.config.ts (`registerType: 'autoUpdate'`) | Nuevo (commit 1ff69d4) |
| 4 | **"Etapa X de N" se calcula distinto en Goals y Progress**: Goals usa conteo de tareas (`countDoneByGoal`), Progress usa hitos reales (`milestoneProgressByGoal`). La misma meta muestra números distintos según la pantalla. | Goals.tsx:131,301-308 vs Progress.tsx:239,276 | Nuevo |
| 5 | **Race condition al marcar hitos**: `setGoalMilestone` en GoalDetail no deshabilita el Roadmap mientras `updating=true`; taps rápidos generan estados inconsistentes. | GoalDetail.tsx (handler de Roadmap) | Persiste |
| 6 | **Recuperar contraseña no existe en la UI**: `resetPassword()` ya está implementado en servicios pero Auth.tsx no lo expone ("¿Olvidaste tu contraseña?" no aparece). | src/services/auth.ts:39-44 vs src/screens/Auth.tsx | Persiste (mitad arreglado) |
| 7 | **`aria-current` ausente en la navegación** (BottomNav/SideNav): el lector de pantalla no anuncia la página activa. Arreglo de minutos. | BottomNav.tsx:30-32, SideNav.tsx:54-62 | Persiste |

## Fallas — severidad MEDIA (las que más pegan)

- **Calendar quedó congelado desde mayo** — siguen abiertos sus cuatro bugs: eventos de día completo aportan 0 minutos a la meta (events.ts:114-136), no se valida `fin > inicio` al guardar (Calendar.tsx:391), eventos "fantasma" al moverlos fuera del rango visible sin refetch, y segmented controls sin `aria-pressed`.
- **SessionRun: pausa/reanudación con red intermitente** — `doPause`/`doResume` tragan el error en silencio (SessionRun.tsx:240-266); si la pausa no se persistió, el tiempo acumulado se calcula mal al reanudar y al reabrir desde otra pestaña. Mostrar aviso de desincronización o re-sincronizar timestamps.
- **Progreso de Learn solo en localStorage** (Learn.tsx:15-38): se pierde al limpiar el navegador y no sincroniza entre dispositivos. Migrar a tabla `user_lesson_progress`.
- **Botón "Progreso" inerte en el segmented de Progress** (Progress.tsx:126-131): parece interactivo pero no hace nada y no refleja la URL; usar `aria-current` o estado derivado de `location.pathname`.
- **Contraste sub-AA**: `--text-faint` (#7e8773) ronda 3:1 sobre `--surface`; afecta navegación inactiva, deadlines y metadatos (tokens.css:95, components.css:689-690).
- **Crear hábito desde Learn no confirma nada** (Learn.tsx:66-74 → Habits.tsx): falta toast post-creación; y editar los días de un hábito guarda al instante sin indicarlo (Habits.tsx:154-168).
- **Today apila hasta 5-6 avisos antes del plan** (Today.tsx:330-512): en móvil el plan del día queda bajo el fold.
- **Errores silenciados sin telemetría**: patrón `.catch(() => {})` en closeStaleSessions, backfill, syncTimezone, disablePush (Today.tsx:89,109,111; profile.ts:81; push.ts:75). Al menos `console.warn` en dev.
- **Edge Function send-reminders**: errores de push distintos de 404/410 se ignoran y solo devuelve `{sent}` sin conteo de fallos; el cron y los 4 secrets (VAPID, CRON_SECRET) no están documentados en ningún lado.
- **Voseo residual vs. convención nueva (español neutro, 2026-06-10)**: queda copy rioplatense en pantallas enteras ("Empezá", "saltás", "volvé" — TaskItem.tsx:34 entre otros). Hace falta una pasada de migración de copy completa, no arreglos puntuales.
- **GoalDetail**: editor sin `<label>`/`htmlFor` (GoalDetail.tsx:378-443); empty-state hardcodea `navigate('/metas')` en vez de `goBack()` (línea 280); pasar una meta a "done" no resuelve visualmente los hitos pendientes.
- **Profile**: sin dirty-check (guarda aunque nada cambió), chips de nicho sin `aria-pressed`.
- **Onboarding**: el paso de foco sigue sin feedback de selección (`selected` hardcodeado, Onboarding.tsx:80,87).

## Fallas — severidad BAJA (selección)

- ErrorBoundary recarga con `window.location.assign('/')` en vez de resetear estado React.
- LoadingScreen muestra errores crudos de Supabase ("JWT expired") sin mapear a español.
- Dos `<nav>` con el mismo `aria-label` siempre en el DOM (SideNav + BottomNav).
- Racha de hábito aparece "de golpe" recién en día 2 (`streak >= 2`); menú de hábito no se cierra al tocar fuera; botón "Crear" sin estado "Creando…".
- ~20 estilos inline en Progress.tsx; empty-state de "Tu camino" sin CTA.
- `weekdays` sin validar rango [0,6] en createHabit/updateHabit (boundary, no dominio).
- ConfigNeeded usa `<h2>` sin `<h1>`.

## Operacional (recordatorio)

- **Migración 0009 (hábitos/avances) sigue sin correr en producción** — la UI de Hábitos ya está desplegada en código; si el deploy llega antes que la migración, la pestaña Hábitos rompe contra tablas inexistentes. La migración en sí es segura (`if not exists`, RLS correcto, FK con cascade).
- Edge Function de push sin desplegar; falta documentar secrets y cron (cron va en Supabase, no en vercel.json).

---

## Integración entre zonas — el mapa

Estado actual de conectividad:

- **Eje fuerte**: Today ↔ Metas ↔ Progreso ↔ Revisión (datos y navegación fluyen).
- **Islas**: Hábitos no se relaciona con Metas, ni aparece en Calendario, Progreso ni Revisión (0 referencias cruzadas en código). Learn solo conecta por deep-link de creación. Calendario tiene FK evento→meta pero GoalDetail no muestra los eventos de su meta.
- **Nodo pasivo**: Perfil alimenta defaults (ritmo, nicho, meta prioritaria ⭐) pero nada le devuelve información ni se puede reeditar el foco.

### Oportunidades priorizadas (valor / costo)

| # | Integración | Zonas | Valor | Costo | Qué ya existe que la facilita |
|---|---|---|---|---|---|
| 1 | **Vincular hábito a meta** (`habits.goal_id` opcional): marcar hábitos desde la sesión, contarlos en revisión y progreso de la meta | Hábitos ↔ Metas ↔ Revisión | Alto | Bajo | La racha ya es agnóstica al tipo de actividad; migración pequeña + selector en el form de hábito |
| 2 | **Mini-resumen semanal en Today** ("2 de 4 sesiones esta semana"): visión de ritmo sin ir a Progreso | Today ↔ Progreso | Alto | Bajo | `weekConsistency` ya existe (domain/sessions.ts); los datos ya se cargan en Today |
| 3 | **Aviso de solapamiento evento–sesión** al fijar hora de una sesión que choca con un evento | Calendario ↔ Sesiones | Alto | Medio | Eventos y sesiones ya se cargan juntos en Calendar.tsx:116-120 |
| 4 | **Learn personalizado**: ordenar colecciones por el nicho de la meta prioritaria ⭐ o `primaryNiche` del perfil | Learn ↔ Perfil ↔ Metas | Alto | Medio | `profile.priorityGoalId`, `getNiche`, colecciones ya etiquetadas por área |
| 5 | **GoalDetail muestra sus eventos** (la FK ya existe, solo falta la vista) + crear evento desde la meta | Metas ↔ Calendario | Medio | Bajo | `events.goal_id` ya en schema; query es un filtro |
| 6 | **Racha combinada** (sesiones + hábitos) en Progress | Progreso ↔ Hábitos | Medio | Bajo | `habitStreak` y `currentStreakCommitted` comparten lógica |
| 7 | **Marcar hito al terminar sesión** en SessionRun (sin ir al detalle) | Sesiones ↔ Metas | Medio | Bajo | `setMilestoneDone` e hitos ya cargados en SessionRun |
| 8 | **Revisión semanal que lea hábitos y sesiones**, no solo hitos ("cumpliste el hábito X 5 veces esta semana") | Revisión ↔ Hábitos ↔ Sesiones | Medio | Medio | Depende de #1 para máximo valor |
| 9 | Editar foco general en Perfil (alimenta Learn y sugerencias) | Perfil ↔ Learn | Bajo-Medio | Muy bajo | UI de nichos ya existe en Onboarding |
| 10 | Sesión espontánea → "¿la hacemos regular?" (agregar bloque al compromiso) | Today ↔ Compromiso | Bajo | Medio | CommitmentStep necesita refactor para reuso |
| 11 | Proyección de logro sin IA ("a este ritmo, llegas en ~6 semanas") en cards de Progress | Progreso ↔ Metas | Bajo | Bajo | Matemática pura sobre datos ya cargados |
| 12 | Hábitos visibles en Calendario | Calendario ↔ Hábitos | Bajo | Alto | — (postergable) |

---

## Plan recomendado

**Sprint 1 — confiabilidad (antes de empujar push/0009 a producción):**
1. Correr migración 0009 ANTES del próximo deploy (la pestaña Hábitos ya está en el bundle).
2. Manejo de sesión expirada: helper transversal de errores (401/403 → "Tu sesión expiró" + re-login).
3. PWA: `onNeedRefresh` con aviso en vez de recarga inmediata, o guard de dirty-state en GoalDetail/Profile/Calendar.
4. Carryover mínimo: aviso "Quedaron N cosas de ayer" en Today.
5. Quick wins de una línea: `aria-current` en nav, "¿Olvidaste tu contraseña?" en Auth, unificar "Etapa X de N" con `milestoneProgressByGoal`, guard `disabled={updating}` en Roadmap.

**Sprint 2 — coherencia:**
6. Bugs de Calendar (validar fin>inicio, minutos de eventos all-day, refetch al mover).
7. Pasada completa de copy a español neutro (queda voseo en media app).
8. Contraste `--text-faint`, labels del editor de GoalDetail, dirty-check de Profile.
9. Learn: progreso a BD; toast al crear hábito desde Learn.

**Sprint 3 — integración (lo que más mejora el producto):**
10. Hábito ↔ Meta (#1) + racha combinada (#6) + revisión que lea hábitos (#8).
11. Resumen semanal en Today (#2).
12. Eventos en GoalDetail (#5) y solapamiento evento–sesión (#3).
