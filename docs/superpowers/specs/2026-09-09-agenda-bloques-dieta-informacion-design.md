# Agenda por bloques de tiempo y dieta de información

**Fecha:** 2026-09-09
**Estado:** diseño aprobado por el usuario (mockup: https://claude.ai/code/artifact/83eda401-6b1e-45e1-9ee5-5e6d47ff78fe)
**Alcance:** vista Día y Semana de `/calendario`, y una pasada de "dieta de información" en las
otras nueve pantallas, en tres fases.

## 1. Problema

La vista Día de la agenda es una grilla horaria (1 px = 1 min, commits `8991433` y `44b14f4`).
En un teléfono de 390 px falla con un día normal. Se verificó con el CSS real de la app y un
día de prueba (3 sesiones, 2 hábitos, 3 eventos, 1 fecha objetivo):

1. **Los títulos desaparecen.** Un bloque de 30–45 min mide 30–45 px. El título tiene
   `overflow: hidden` (por el `line-clamp`) y en un flex de columna es el único hijo que puede
   encogerse: se aplasta a 0 y solo queda la línea de horas. "Aprender inglés" y "Correr 5 km"
   no se leen.
2. **Hacer dos cosas a la misma hora se castiga.** Los solapes se reparten el ancho en
   carriles; "Tomar agua" queda como "T…". El usuario hace varias cosas en la misma hora y
   quiere que eso sea normal, no una excepción rota.
3. **Un hábito de cinco repeticiones domina el día.** Cinco filas de "Tomar agua" pesan igual
   que las sesiones comprometidas.
4. **Ruido fijo arriba.** Un hint de tres líneas, la fecha repetida (h1 y etiqueta del día) y
   las acciones repartidas entre dos filas y un enlace al final.

En el resto de la app, dos auditorías previas juzgaron la densidad "correcta" pantalla por
pantalla, pero el usuario la percibe cargada. Leídas las diez pantallas, el patrón es el mismo
en todas: **el mismo dato aparece dos o tres veces**, y **la historia, los metadatos y las
explicaciones están siempre visibles** en lugar de plegados.

## 2. Decisiones (cerradas con el usuario)

| Decisión | Elección |
|---|---|
| Vista Día | **Bloques de tiempo desplegables.** Lo que se solapa en el tiempo forma un bloque que se despliega al tocarlo; lo que va solo es una fila normal. El bloque de la hora actual viene abierto; los huecos libres quedan como renglón tocable. |
| Hábitos con repeticiones | **Una fila por hábito por día**, en su próxima hora pendiente, con "2 de 5 hoy". El check marca la siguiente repetición (igual que Hoy). "Reorganizar el día" sigue editando cada repetición. |
| Vista Semana | **Acordeón por día:** cabecera con fecha y resumen; hoy abierto; en escritorio (≥ 1024 px) todos abiertos. |
| Dieta de información | **Todas las pantallas, en tres fases:** (1) Agenda; (2) Hoy + Metas + Detalle de meta; (3) Progreso + Hábitos + Perfil + Sesión + Revisión. |
| Grilla horaria | Se elimina (código, CSS y tests). No se conserva para escritorio. |

### Por qué bloques y no una lista plana ni la grilla

- La grilla escala el alto con la duración: en móvil no hay alto para 30 min ni ancho para dos
  carriles. Arreglarla exige alturas mínimas que rompen la escala de tiempo, que es su única
  razón de ser.
- Una lista plana (una fila por cosa) resuelve la legibilidad pero no expresa "estas tres cosas
  pasan a la vez", que es como el usuario vive su hora.
- El bloque expresa exactamente eso: **una franja compartida que se lee cerrada de un vistazo y
  se abre para operar cada cosa.** Y es la misma gramática de "desplegar hacia abajo" que se
  aplica al resto de la app.

## 3. La regla de la dieta (vale para todas las pantallas)

1. **Cada dato aparece una vez por pantalla.** Si el color o un glifo ya lo dicen, no va en
   texto. Si la barra ya lo dibuja, el número no se repite al lado.
2. **La pantalla muestra lo que se hace hoy y su estado.** Historia (avances, últimas 8
   semanas, camino completo), metadatos (área, tipo, "lo logras cuando") y explicaciones
   (leyendas, párrafos de ayuda) se pliegan en un desplegable, van a la hoja de detalle, o se
   muestran una sola vez como `Hint` descartable.
3. **Una fila = una línea principal + como máximo una secundaria.** Nada se apila en tres
   líneas por ítem.
4. **Las acciones raras van a un menú o una hoja.** En la fila vive la acción frecuente
   (check, empezar); editar, borrar y vincular van detrás de un toque.
5. **Un solo "+" por pantalla.** Si hay dos cosas que agregar, el "+" abre una hoja con las dos.

## 4. Lógica de dominio (pura, en `src/domain/`)

### 4.1 `agenda.ts`: bloques del día

Se conservan `sessionSpan`, `eventSpan`, `assignEventsToSessions`, `freeGaps`, `rangeLabel`
y `gapLabel`. Se eliminan `gridBounds`, `layoutDay`, `uncoveredGaps` y sus tipos
(`GridBounds`, `GridPlacement`) con sus tests: eran solo de la grilla.

Se agrega:

```ts
/** Ítem con hora del día, ya ordenable. */
export interface DayItemSpan { key: string; start: string; end: string | null }

/** Franja compartida: rango real y las claves de sus ítems, ordenadas por inicio. */
export interface DayBlock {
  key: string            // `b-${start}` del primer ítem
  start: string          // inicio del primer ítem
  end: string | null     // el mayor fin REAL de sus ítems; null si ninguno tiene fin
  startMin: number
  endMin: number         // fin EFECTIVO (para huecos y para "ahora")
  items: DayItemSpan[]
}

export function groupIntoBlocks(items: DayItemSpan[]): DayBlock[]
```

Reglas de `groupIntoBlocks`:

- Se ordena por inicio (empate: el más largo primero, luego clave). Un ítem sin fin ocupa
  **30 min efectivos** (`MIN_EFFECTIVE_MINUTES`, ya existe) solo para decidir solapes y huecos.
- Un ítem **se une al bloque abierto si empieza antes del fin efectivo del bloque**
  (`startMin < block.endMin`). Solape estricto: dos cosas que se tocan (8:00–8:30 y 8:30)
  quedan en bloques distintos. Así una tarde ocupada no se funde en un solo bloque de tres
  horas.
- Al unirse, el fin efectivo del bloque es el máximo; el fin real (`end`) es el máximo de los
  fines reales, o `null` si ninguno tiene.
- Nota sobre el mockup: su bloque de la noche ("8:00–9:00 · Leer · Tomar agua · Llamada")
  supone que la llamada empieza antes de las 8:30. Si empezara justo a las 8:30, con esta
  regla quedaría como fila aparte debajo de un bloque "8:00–8:30 · 2 cosas". Es intencional.
- Un bloque de **un solo ítem** se renderiza como fila normal (la UI decide; el dominio
  devuelve el bloque igual, `items.length === 1`).

```ts
/** Franja del día por hora de inicio. */
export type DayPeriod = 'morning' | 'afternoon' | 'evening'
export function periodOf(hhmm: string): DayPeriod   // < 12:00 → morning · < 19:00 → afternoon · resto evening
export const PERIOD_LABELS: Record<DayPeriod, string> // Mañana · Tarde · Noche
```

`freeGaps(items, minMinutes = 45)` gana un parámetro; la agenda lo llama con **60**. Se aplica
sobre la secuencia de bloques (usando `startMin`/`endMin`), no sobre ítems sueltos. Los huecos
antes del primer bloque y después del último no se muestran: para eso está el "+".

```ts
/** Qué bloque abrir por defecto hoy: el que contiene `nowMin`, o si no hay, el próximo. */
export function defaultOpenBlock(blocks: DayBlock[], nowMin: number): string | null
/** Índice del primer bloque que empieza en o después de `nowMin` (dónde va la línea "Ahora");
 *  `blocks.length` si todos empezaron antes (la línea va al final). */
export function nowLineIndex(blocks: DayBlock[], nowMin: number): number
```

La línea "Ahora" se coloca dentro de la franja (Mañana/Tarde/Noche) que corresponde a la hora
actual, aunque esa franja no tenga bloques; en ese caso la franja se muestra solo con la línea.

### 4.2 `habits.ts`: una fila por hábito

```ts
/** Cómo se ve un hábito en la agenda de un día: una sola fila. */
export interface HabitDayRow {
  doneCount: number
  target: number
  complete: boolean
  /** Hora de la próxima repetición pendiente; si está completo, la última hora; null sin horas. */
  time: string | null
}
export function habitDayRow(habit: Habit, checks: HabitCheck[], dateISO: string): HabitDayRow

/** Qué slot tocar al marcar desde una fila única: el siguiente pendiente, o el último si está completo. */
export function habitTogglePlan(
  habit: Habit, checks: HabitCheck[], dateISO: string,
): { slot: number; add: boolean }
```

`habitTogglePlan` es la lógica que hoy vive inline en `Today.toggleHabit`; Hoy pasa a usarla
también (misma regla en las dos pantallas).

### 4.3 Tests (Vitest, `src/domain/*.test.ts`)

- `groupIntoBlocks`: sin solape → un bloque por ítem; solape parcial → un bloque con rango
  real y efectivo; ítems que se tocan no se unen; un ítem puntual cuenta 30 min; el fin real
  es `null` si ningún ítem tiene fin; orden estable.
- `periodOf`: bordes 11:59 / 12:00 / 18:59 / 19:00.
- `defaultOpenBlock` y `nowLineIndex`: dentro de un bloque, entre bloques, antes del primero,
  después del último.
- `freeGaps` con `minMinutes` 60.
- `habitDayRow` y `habitTogglePlan`: sin horas, con horas parciales, completo, desmarcar el
  último.
- Se borran los tests de `gridBounds`, `layoutDay` y `uncoveredGaps`.

## 5. Pantallas

### 5.1 Agenda: vista Día (`Calendar.tsx`)

Un solo componente `DayAgenda` reemplaza a `DayTimeGrid` y al cuerpo de `DaySection`. Lo usan
la vista Día, el panel del día en Mes y el cuerpo de cada día en Semana.

**Cabecera de la pantalla**

- `h1` con la fecha ("Hoy, mar 9 sep"); a su derecha, en la misma fila, las dos acciones:
  ✎ Reorganizar (solo hoy/futuro) y "+".
- Debajo, la fila de navegación actual: ‹ · Hoy · › y el segmentado Día / Semana / Mes.
- **Se elimina** el `Hint` `calendar-uses-2026-06`, la etiqueta `cal-day__label` (repetía la
  fecha) y el enlace "+ Sesión para una meta" del final.
- El "+" abre una hoja `AddSheet` con dos opciones: **Evento** (abre `EventEditor`) y
  **Sesión para una meta** (abre `PlanSessionSheet`; solo si hay metas activas y el día es hoy
  o futuro).

**Cuerpo (`DayAgenda`)**

1. **Todo el día**: chips actuales (`tg-chip`) para fechas objetivo y eventos de día completo.
2. **Cronología por franjas**: kickers *Mañana · Tarde · Noche* (solo si tienen algo). Dentro,
   en orden de hora:
   - **Fila** (`AgendaRow`) para un ítem solo: columna de hora (inicio en negrita; fin debajo,
     tenue), cuerpo (título en una línea; subtítulo opcional en una línea), y a la derecha la
     acción: ▶ redondo del color de la meta para sesiones abiertas de hoy, chevron para otras
     sesiones, check para hábitos y eventos.
   - **Bloque** (`AgendaBlock`) para dos o más ítems solapados: cabecera con rango real,
     títulos en una línea separados por " · ", y "N cosas" con un punto de color por meta; al
     tocar, se despliega con una `AgendaRow` por ítem (cada una con su propia hora) y al final
     **"Agregar algo a las H:MM"** (abre `EventEditor` con `presetStart` = inicio del bloque y
     `presetEnd` = +1 h acotado al fin del bloque). `aria-expanded` en la cabecera.
   - **Hueco libre** (`ag-gap`) entre bloques cuando hay ≥ 60 min: renglón tenue "2 h libres",
     tocable solo hoy/futuro (abre `EventEditor` prellenado como hoy hace `planGap`).
   - **Línea "Ahora · 12:40"** solo en el día de hoy, antes del primer bloque que empieza en o
     después de ahora. Las filas y bloques anteriores llevan `--past` (atenuados). El bloque
     abierto por defecto es el de `defaultOpenBlock`; en días pasados o futuros ninguno.
3. **Sin hora**: kicker + las mismas `AgendaRow` sin hora ("—").

**Qué muestra cada fila**

| Ítem | Título | Subtítulo | Acción |
|---|---|---|---|
| Sesión | título de la meta (negrita, barra del color del área) | estado si no es pendiente/comprometida ("Hecha", "Parcial", "No pudiste", "En curso", "Sin confirmar") · objetivo ("45 min" / "20 páginas") · "plan 1 de 3" si tiene eventos anidados | ▶ (abierta hoy) o › |
| Hábito | título del hábito | "2 de 5 hoy · siguiente 2:00 pm" solo si tiene repeticiones | check |
| Evento | título | primera línea de la nota, o "↩ meta" si está vinculado y no está anidado | check |

Los eventos anidados en una sesión (`assignEventsToSessions`) **no se listan en la
cronología**: cuentan en "plan 1 de 3" y se operan en la hoja del bloque (`BlockSheet`), que
no cambia. Tocar una sesión sigue abriendo `BlockSheet`; tocar un evento abre `EventEditor`;
tocar un hábito marca su siguiente repetición (`habitTogglePlan`), optimista con revert.

**Hábito con repeticiones**: una sola fila, ubicada en la hora de `habitDayRow.time`. Completo
→ tachado en su última hora. Sin horas → en "Sin hora".

### 5.2 Agenda: vista Semana

Acordeón de siete días (`WeekDay`):

- Cabecera (botón, `aria-expanded`): columna con día de la semana y número (hoy en naranja),
  resumen en dos líneas y chevron.
  - Línea principal: sesiones ("2 sesiones", "1 de 3 sesiones" hoy, "2 sesiones cumplidas" en
    días pasados con todas hechas) con un punto de color por meta; si no hay sesiones, lo
    primero que exista (hábitos, eventos, fecha objetivo).
  - Línea secundaria: el resto separado por " · " ("Hábitos 1 de 3 · 3 eventos · Meta:
    Ahorrar para el viaje"). Día vacío: "Nada agendado".
- Cuerpo: `DayAgenda` completo del día, incluidos sus chips de "Todo el día" (la cabecera del
  acordeón no los repite; solo los cuenta en el resumen).
- Estado inicial: hoy abierto; en `min-width: 1024px` todos abiertos (mismo `matchMedia` que ya
  decide la vista inicial). El estado es local del componente y no persiste.
- El "+" de la cabecera de pantalla agrega al día seleccionado (hoy por defecto); dentro de
  cada día abierto, los huecos y los bloques ofrecen su propio "Agregar".

### 5.3 Agenda: vista Mes

Sin cambios de estructura: grilla mensual + panel del día seleccionado. El panel usa `DayAgenda`
y conserva una etiqueta con la fecha del día seleccionado (aquí el `h1` es el mes, así que no
se duplica). El banner "Estás viendo un día pasado / Día futuro" se mantiene en Día y Mes.

### 5.4 CSS

- Nuevas clases en `components.css`: `ag`, `ag__kicker`, `ag-row` (+ `--session`, `--past`,
  `--done`), `ag-row__time/start/end/main/title/sub/aside`, `ag-play`, `ag-chev`, `ag-now`,
  `ag-gap`, `blk`, `blk__head/sum/titles/meta/dots/dot/chev/body/add`, `blk--open`,
  `blk--session`, `wk`, `wk-day` (+ `--today`, `--open`), `wk-day__head/date/dow/num/sum/chev/body`.
  Valores de referencia: los del mockup aprobado (filas de 54 px mínimo, hora en 13/11 px
  tabular, título 15 px, subtítulo 12 px, ▶ de 34 px, línea "Ahora" en `--primary`).
- Filas sin tarjeta ni sombra: separadas por `border-top: 1px solid var(--border-soft)`. Las
  sesiones se distinguen por la barra de 3 px del color del área y el título en 600.
- Se eliminan `.tg`, `.tg__*`, `.tg-item*`, `.tg-gap`, `.tg-untimed`, `.ev-gap`, `.ev--block`,
  `.ev-block__head`, `.ev--session`, `.ev--habit-done`, `.ev__time-end`, `.ev-go*` y las
  reglas de `.cal-week` como tablero. Se conservan `.tg-allday`, `.tg-chip*` (renombradas a
  `.ag-allday`, `.ag-chip*`), `.ev` (lo usa "Tu agenda de hoy" en Hoy), `.ev__sublist`,
  `.ev-sub*` (los usa `BlockSheet`), `.check`, `.tag`, `.seg`, `.sheet*`, `.bsheet*`,
  `.reorg*`.
- `prefers-reduced-motion` apaga la rotación del chevron y cualquier transición de apertura.

### 5.5 Fase 2: Hoy, Metas, Detalle de meta

**Hoy (`Today.tsx`, `SessionCard.tsx`, `HabitRow.tsx`)**

- Se elimina la frase "X de Y sesiones de tu compromiso esta semana" bajo la tira semanal
  (`Today.tsx` ~L638-644): los puntos ya lo dicen.
- `SessionCard`: se elimina `session__why` (el porqué se lee en la pantalla de sesión); la
  pista pasa a **dos datos como máximo**: rango u objetivo, y "Tu plan: 1 de 3" solo si hay
  plan. Desaparece "Idea: …" (la sugerencia sigue en la pantalla de sesión). En la tarjeta
  cerrada, "Hecha 7:45" sin repetir el objetivo.
- `HabitRow`: se conservan los puntos por repetición y "próxima 3:00 pm"; se elimina el
  "2 de 5" textual (duplicaba los puntos). El chip de racha se mantiene.
- Hoy usa `habitTogglePlan` en vez de su lógica inline.

**Metas (`Goals.tsx`)**

- En la tarjeta se eliminan el `tag--niche` con el nombre del área (L351; el glifo y el color
  ya lo dicen) y "N acciones hechas" (L357-359).
- `GoalPeek` deja de repetir la tarjeta: muestra glifo + título, el porqué ("Porque …") y la
  **próxima etapa** ("Siguiente: título de la etapa"), más los dos botones actuales.

**Detalle de meta (`GoalDetail.tsx`)**

- "Tus avances": **últimos 3** + desplegable "Ver todos (N)".
- Tarjeta lateral de información (Área, Tipo, Para cuándo, Lo logras cuando, Agendado esta
  semana) → un desplegable **"Detalles"** cerrado. "Para cuándo" sube como chip junto al
  título (fecha relativa) para no perder el dato importante.
- Se elimina la línea `formatCommitmentSummary` bajo los chips del compromiso (L513-515).
- Se eliminan la tarjeta "En tu agenda esta semana" (L675-687) y el hint "También puedes
  bloquear tiempo extra…" (L689-697); el dato "Agendado esta semana" vive en Detalles.
- Las tres cifras de progreso se conservan (una sola fila).

### 5.6 Fase 3: Progreso, Hábitos, Perfil, Sesión, Revisión

**Progreso (`Progress.tsx`)**

- Se elimina la leyenda "Verde: cumplido · ámbar: parcial · punteado: por venir" (L252-254);
  cada día lleva `title`/`aria-label` con su estado.
- "Últimas 8 semanas" → desplegable cerrado "Últimas 8 semanas". Se elimina el pie "% de
  sesiones cumplidas… esta semana: N%" (L385-390).
- En las tarjetas de metas se elimina "· Xh invertidas" (L306; vive en el detalle). En las
  filas de hábitos se elimina el tag de la meta vinculada (L341).
- "Tu camino": **5 entradas** + "Ver más (N)".

**Hábitos (`Habits.tsx`)**

- "Ideas populares": solo en el estado vacío; con hábitos creados, desplegable cerrado "Ideas".
- `pautaLabel` sin las horas ("Todos los días · 5 veces al día"); las horas se ven en el
  menú ⋯ (`TimesEditor`).
- El tag de meta vinculada sale de la fila y se ve en el menú ⋯.
- Las cuatro micro-explicaciones del formulario (L99-102, L125-129, L462-466, L495-498) se
  reducen a una línea bajo el formulario.

**Perfil (`Profile.tsx`)**

- "Tu marco": se muestran racha actual y marco actual; la galería completa y el párrafo
  explicativo pasan a un desplegable "Cómo se ganan los marcos".
- Las instrucciones de instalación en iPhone pasan a un desplegable "¿Cómo activarlos en
  iPhone?" (L293-302).
- Se eliminan los `field__hint` bajo "¿Cuándo te es más fácil cumplir?" y "Sesión por
  defecto" (L206, L238) y la nota "Lógralo es gratis…" (L375-377).

**Sesión en curso (`SessionRun.tsx`)**

- "El plan de esta sesión" mientras corre el reloj → una fila "Plan · 2 de 5" que se despliega;
  el formulario de alta solo dentro del desplegable.
- El tag de sugerencia (L509-511) solo en `pending`. La tarjeta "Estás construyendo"
  (L490-508) se elimina; la etapa actual va en el kicker ("Meta · objetivo · Etapa 2 de 4").
- "Decir «no pude» no rompe nada…" (L113) pasa a `Hint` con id `session-no-pude-2026-09`.

**Revisión (`Review.tsx`)**

- El `Roadmap` completo (L249) se reemplaza por "Etapa actual → siguiente" en texto.
- La línea triple (L250-261) queda en "N sesiones esta semana".
- "Tu porqué" (L240) se limita a una línea con `nowrap-ellipsis` y "más" para expandir.

### 5.7 Componente reutilizable: `Disclosure`

`src/components/Disclosure.tsx`: un `<details>` nativo estilizado (`.disclosure`,
`.disclosure__summary` con chevron que rota, `.disclosure__body`), con `summary` como texto
("Ver todos (12)", "Detalles", "Ideas") y `defaultOpen?: boolean`. Lo usan todas las fases;
nada de estado en React. `AgendaBlock` y `WeekDay` **no** lo usan (necesitan `aria-expanded`
en un botón con layout propio), pero comparten el chevron y la transición.

## 6. Manejo de errores

Sin cambios de modelo ni de servicios. Las mutaciones desde la agenda (marcar hábito, marcar
evento, crear evento desde bloque o hueco) reutilizan los manejadores actuales de
`Calendar.tsx`, todos optimistas con revert y `toast`. `groupIntoBlocks` no lanza: con lista
vacía devuelve `[]`.

## 7. Testing

- `npm test` (Vitest) para todo el dominio nuevo y modificado (§4.3).
- `npm run typecheck` y `npm run lint` limpios al cierre de cada fase.
- Verificación visual de cada fase en la app corriendo (el usuario debe iniciar sesión en el
  navegador que use Claude) con el día de prueba de §1 y un día vacío; y, mientras no haya
  sesión, el harness estático con el CSS real (`scratchpad/harness`) para la Fase 1.
- Al final de cada fase, `node .claude/skills/impeccable/scripts/detect.mjs --json <archivos>`
  una sola vez sobre los archivos de UI tocados.

## 8. Fases de implementación

1. **Fase 1 · Agenda.** Dominio (§4) con tests → `DayAgenda`, `AgendaRow`, `AgendaBlock`,
   `WeekDay`, `AddSheet` y cabecera → CSS nuevo y borrado del CSS de grilla → limpieza de
   código muerto (`DayTimeGrid`, `DaySection`, lanes). Un commit por paso.
2. **Fase 2 · Hoy + Metas + Detalle** (§5.5) + `Disclosure`.
3. **Fase 3 · Progreso + Hábitos + Perfil + Sesión + Revisión** (§5.6).

Cada fase tiene **su propio plan de implementación** (`docs/superpowers/plans/`), termina con
typecheck, lint, tests y verificación visual, y se integra a `master` (solo `master`
despliega). El plan de la Fase 1 se escribe primero; los de las fases 2 y 3, al cerrar la
anterior, para incorporar lo aprendido.

## 9. Fuera de alcance

- Cambios de modelo de datos o migraciones.
- Cambios en `BlockSheet`, `ReorganizeSheet`, `TimeSheet`, `EventEditor` y
  `PlanSessionSheet` más allá de cómo se abren.
- Una grilla horaria para escritorio.
- Gestos (arrastrar bloques, deslizar filas).
- Persistir qué bloques o días quedaron abiertos.
- Sincronización con Google Calendar.
