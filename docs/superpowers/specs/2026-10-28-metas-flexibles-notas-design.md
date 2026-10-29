# Metas flexibles, agenda editable y Notas · Diseño

**Fecha:** 2026-10-28
**Estado:** aprobado e implementado
**Fase:** funcionalidad. El pulido visual llega en una fase posterior: aquí se usan los
componentes y tokens existentes (Sheet, card, btn, OptionRow…) sin diseño nuevo.

## 1. Intención (el porqué)

El modelo actual es demasiado rígido: toda meta *debe* tener días, duración y hora en la
agenda. Muchas metas solo necesitan **estar presentes y recordarse** a diario, sin un tiempo
estipulado. Además no existe forma de eliminar de verdad una meta que no se usa, en la Agenda solo
se puede cambiar la hora de un bloque y la app no tiene dónde guardar notas.

Éxito = el usuario puede crear una meta sin agenda y verla cada día; ve todas sus metas activas
al abrir Hoy y le llega un recordatorio diario; borra lo que no usa; edita la agenda desde la
Agenda misma; y captura notas en segundos y las organiza después.

Anti-objetivos (sería un fracaso aunque "funcione"):
- Que crear una meta sin agenda se sienta como un camino de segunda (avisos, culpas, "te falta").
- Que las notas pidan organizarse al momento de escribirlas.
- Que borrar sea fácil de hacer por accidente.

## 2. Estado actual (verificado en el código)

| Tema | Hoy | Dónde |
|---|---|---|
| Agenda obligatoria | `validateCommitment` exige ≥1 día; el submit del wizard lo defiende como "invariante central" | `src/domain/commitment.ts:185`, `src/screens/Wizard.tsx` (`submit`) |
| Meta en Hoy | Solo aparece si ese día tiene sesión (o como "meta olvidada") | `src/screens/Today.tsx` |
| Eliminar | Solo Pausar / Lograda / Archivar. `deleteGoal` existe pero solo deshace creaciones a medias | `src/screens/GoalDetail.tsx:660-680`, `src/services/goals.ts:144` |
| Editar bloque en Agenda | Solo hora (`updateBlockStartTime`). Días/duración solo desde el detalle (`replaceSchedule`) | `src/screens/Calendar.tsx:355`, `src/services/schedule.ts` |
| Notificaciones | Edge Function `send-reminders` (cron 5 min) avisa sesiones con hora; `profiles.tz` existe | `supabase/functions/send-reminders/index.ts`, `0008_push.sql` |
| Notas | Solo "nota de avance" de sesión y campo Notas de eventos | — |

FKs a `goals`: `goal_schedule`, `sessions`, `milestones`, `tasks` → `on delete cascade`;
`events.goal_id`, `habits.goal_id`, `profiles.priority_goal_id` → `on delete set null`.

## 3. Alcance

### 3.1 Metas sin agenda

- El paso de compromiso del wizard pasa a ser **opcional**. Opción clara "Sin horario por ahora —
  solo quiero tenerla presente" que deja `blocks = []` y deja avanzar.
- `validateCommitment` acepta lista vacía; las demás reglas (valor > 0, unidad en cantidad) siguen
  valiendo cuando hay bloques. Se actualiza el comentario del "invariante central" en el wizard.
- Una meta sin bloques no genera sesiones (ya pasa: `generateSessionsForDate` filtra por bloques).
- Desde el detalle de la meta se le puede **agregar agenda después** (el editor de compromiso
  existente, `replaceSchedule`) y también **quitársela** (ver 3.4).
- Revisar todo lo que asume ≥1 bloque por meta activa (p. ej. `findForgottenGoal`, revisiones
  guiadas, progreso, `GoalCreated`) y hacer que una meta sin agenda no rompa ni se marque como
  "olvidada"/"atrasada".

### 3.2 Metas fijadas arriba en Hoy (decidido)

- Arriba de Hoy, antes de la agenda del día, una franja **"Tus metas"** con **todas las metas
  activas** (con y sin agenda): título y, si existe, el porqué (`why`) en una línea.
- Tocar una meta abre su detalle.
- Si hay muchas, se muestran en una fila con scroll horizontal (o colapsable tras
  3); la forma exacta queda para la fase de pulido.
- Las metas pausadas, logradas o archivadas no aparecen.

### 3.3 Recordatorio diario (decidido)

- **Una notificación al día** a la hora que el usuario elige en Perfil (por defecto apagada; al
  activarla, 07:30 sugerida). Contenido: metas activas (hasta 3 títulos + "y N más") y cuántas
  sesiones tiene hoy. "Sesiones de hoy" se calcula con **los bloques de metas activas que tocan
  el weekday local de hoy, menos las sesiones de hoy marcadas `skipped`**, no con las filas de
  `sessions`: a esa hora casi nunca están generadas (se crean al abrir la app).
- Datos: `profiles.daily_digest_time time null` (null = apagado) y
  `profiles.daily_digest_sent_on date null` para no repetir.
- Se extiende `send-reminders` (mismo cron cada 5 min): si la hora local del usuario cayó en los
  últimos 10 min desde `daily_digest_time` y `daily_digest_sent_on <> hoy local`, envía y marca.
- **Fuera de alcance:** widget / pantalla de bloqueo nativos. La PWA no puede; la notificación ya
  aparece en la pantalla de bloqueo. Un widget real exigiría empaquetar la app nativa (Capacitor).

### 3.4 Editar la agenda desde la Agenda (decidido)

La hoja que abre un bloque de meta en la Agenda (`Calendar.tsx`, `blockSheet`/`timeSheet`) suma,
además de la hora:

1. **Días de la semana** — cambia qué días toca la meta (afecta a todas las semanas).
2. **Duración / cantidad** — cambia el valor del bloque.
3. **Saltar solo este día** — la sesión de esa fecha queda saltada; el resto de la semana igual.
4. **Sacar la meta de la agenda** — borra todos sus bloques; la meta queda sin horario (sigue
   fijada en Hoy). Con confirmación.

**Alcance de un cambio:** al guardar duración/cantidad u hora desde un
bloque, se pregunta **"¿Solo los <día> o todos los días de esta meta?"**. Al agregar un día nuevo,
hereda la hora y el valor del bloque que se tocó.

**Edición por diferencias, no reemplazo:** hoy
`replaceSchedule` borra y recrea los bloques. Eso deja las sesiones con `schedule_id = null`, y
entonces (a) `Progress.tsx:125` deja de contarlas en "últimas 8 semanas" y (b) las sesiones
pendientes de hoy/futuras siguen visibles en la Agenda (`Calendar.tsx:262-288`) junto a los
bloques nuevos proyectados (duplicados). Con la edición rápida esto pasaría a diario. Por eso:

- Nueva función de dominio pura que, dado lo actual y lo deseado, devuelve
  `{ update, insert, delete }` por weekday. Los bloques que siguen **conservan su id**. Lleva tests.
- Servicio que aplica ese diff. Al **actualizar** un bloque, las sesiones `pending` de hoy en
  adelante de ese bloque toman el nuevo valor/hora. Al **borrar** un bloque (quitar día o sacar
  la meta de la agenda), se borran sus sesiones `pending`/`skipped` de hoy en adelante. Las
  pasadas y las ya iniciadas/hechas se conservan.
- El editor del detalle de la meta pasa a usar el mismo diff (deja de usar `replaceSchedule`).

**Saltar solo este día:** se agrega el estado `'skipped'` a `sessions.status` (hoy: pending,
running, done, partial, missed, unconfirmed) en la migración. La sesión ya existe (la crea el
upsert idempotente) o se crea al saltar si el día aún no se generó. Saltar = cambiar su estado;
borrarla no sirve porque el upsert la recrearía. Se puede deshacer (vuelve a `pending`).

**Racha: un día saltado es neutro.** No suma ni rompe, igual que
"Saltar hoy" en Hábitos. Si en un día comprometido todas las sesiones de la meta quedaron
saltadas, ese día se trata como no comprometido en `currentStreakCommitted`, en la mejor racha y
en `dayState` (devuelve `'free'` o un estado neutro equivalente) en `src/domain/sessions.ts`. Las
saltadas tampoco cuentan en el denominador de Progreso. Es un cambio del dominio compartido entre
Hoy y Progreso, con tests.

Las mismas cuatro acciones deben estar también en el detalle de la meta, para no tener dos
lugares que hagan cosas distintas.

### 3.5 Eliminar de verdad (decidido)

- Se mantiene **Archivar** (guarda historial).
- Se agrega **Eliminar meta** en "Más opciones" del detalle, visible en cualquier estado (activa,
  pausada, lograda, archivada), con confirmación explícita que diga qué se pierde: etapas,
  agenda, sesiones y tareas. Los eventos, hábitos y notas vinculados **no se borran**: quedan
  desvinculados (ya es así para eventos y hábitos por `set null`; igual para notas, §3.6).
- Usa `deleteGoal(userId, goalId)` existente; tras borrar, vuelve a la lista de Metas con toast.
- Sin "deshacer" (sería restaurar en cascada); la confirmación es la protección.

### 3.6 Notas (inspirado en Google Keep y el método PARA)

Pestaña propia **Notas** en la barra inferior, **en el lugar de Crecer**: la barra queda Hoy · Hábitos · Metas · Agenda · Notas. Crecer (`/progreso`,
`/aprender`) sigue existiendo y se abre desde el avatar de Hoy / Perfil. En la
navegación lateral de escritorio (`SideNav.tsx`) caben las seis, así que Crecer se mantiene ahí.

Piezas:
1. **Captura rápida:** botón "+ Nota" en la pestaña; texto libre o checklist. No se pide
   clasificar al crear.
2. **Bandeja:** las notas sin clasificar viven en "Bandeja". Desde cada nota se **asigna** a una
   meta, a un área (los mismos `NicheId` de las metas) o a **Ideas** (lo de "Recursos" en PARA).
3. **Fijar:** las fijadas salen arriba de la pestaña.
4. **Convertir en acción:** desde una nota → **nueva meta** (abre el wizard con el título
   prellenado y el cuerpo como `why`), **nueva etapa** de una meta elegida, o **tarea de hoy**.
   Tras convertir, la nota se archiva sola (toast con "Deshacer").
5. **En el detalle de cada meta** se listan sus notas, con "+ Nota" ya vinculada.
- Sin recordatorios en notas, sin etiquetas libres, sin enlaces entre notas.
- Archivar nota (sale de las vistas, filtro "Archivadas") y eliminar nota (con confirmación).

Vista de la pestaña: fijadas arriba; luego filtro por **Bandeja · Metas · Áreas · Ideas ·
Archivadas**; búsqueda por texto simple en el cliente.

Datos (migración nueva, RLS en la misma migración):

```sql
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text,
  body        text not null default '',
  items       jsonb,                 -- checklist: [{ "text": "...", "done": false }]; null = nota de texto
  place       text not null default 'inbox' check (place in ('inbox','goal','area','ideas')),
  goal_id     uuid references public.goals (id) on delete set null,
  area        text,
  pinned      boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- RLS: el dueño hace todo sobre sus filas (mismo patrón que push_subscriptions).
```

Si una meta se borra, sus notas quedan con `goal_id = null` y deben volver a la bandeja. Se
resuelve en la lógica de lectura (`place = 'goal'` con `goal_id` nulo se trata como bandeja), sin
trigger.

## 4. Restricciones

- Reglas del repo: español neutro con tuteo; TypeScript estricto; estilos solo con tokens; sin
  `eslint-disable`; dominio en funciones puras con tests (Vitest); sin dependencias nuevas.
- Migraciones: se aplican manualmente desde el SQL Editor. Los servicios toleran que aún no estén
  aplicadas (mismo patrón que la migración 0016: códigos `42703`, `PGRST204`, `42P01`,
  `PGRST205` → reintentar sin las columnas nuevas o devolver vacío).
- La Edge Function se despliega por separado; documentar en `docs/notificaciones.md`.

## 5. Abierto a la implementación

- Orden de las fases de implementación (sugerencia: 3.1 → 3.5 → 3.2 → 3.4 → 3.6 → 3.3, de menor
  a mayor riesgo, cada una entregable sola).
- Textos exactos de la UI y de las confirmaciones (dentro del tono de la app).
- Estructura de componentes y nombres de archivos.

## 6. Decisiones de diseño

Franja de metas con scroll horizontal; sin deshacer al borrar una meta (la confirmación es la
protección); nota archivada tras convertirla; búsqueda simple de notas; notas huérfanas vuelven a
la bandeja por lógica de lectura; edición de agenda por diferencias con ids estables; resumen
diario calculado desde bloques; Crecer se mantiene en la navegación lateral de escritorio.
