# Organizar el día con IA (fase 1: texto)

Fecha: 2026-11-07. Rama: `feat/ia-agenda-dia`.
Origen: `docs/analisis/2026-11-07-ia-agenda-del-dia-propuesta.md` (evaluación aprobada).

## 1. Objetivo

A una persona ocupada le cuesta acomodar el día. Escribe en lenguaje natural lo
que tiene y lo que quiere hacer ("reunión de 9 a 11, gimnasio, recoger a los niños
a las 4, avanzar la tesis") y la app le devuelve un **borrador del día** con
preguntas de validación (horas, duraciones, qué puede hacer a la vez). Nada se
guarda hasta que pulsa **Aplicar**, y puede **Deshacer**.

Decisiones tomadas (con la recomendación aceptada):
- La voz va en la fase 2 (MediaRecorder + transcripción en servidor). Esta fase
  deja el campo listo para recibir texto dictado.
- La IA puede **mover** lo que ya está en el día (sesiones, hábitos, eventos con
  hora), no solo agregar. Todo movimiento se ve en el borrador como
  "movido de 7:00 a 8:30".
- Única migración: `0020_ai_quota.sql` (límite diario de IA guardado en la base).

Fuera de alcance: voz, memoria del horario de la persona, marca de origen IA en
eventos, replanificar en vivo, crear hábitos nuevos, mover tareas existentes.

## 2. Principio: la IA entiende, el código coloca

Los modelos fallan al ubicar actividades con restricciones (NATURAL PLAN), y un
algoritmo se puede probar. Por eso:

| Pieza | Responsable |
|---|---|
| Entender el texto: qué actividades, fija o flexible, hora, duración, momento del día, modo de atención, a qué meta pertenece | IA (acción `day`) |
| Preguntar lo que falta en el texto y cambia el resultado | IA (máx. 3) |
| Ubicar en el tiempo, detectar choques, decidir qué se puede combinar | Código puro `src/domain/dayPlan.ts` |
| Preguntar lo que no cuadra (no cabe, choque) | Código puro, resuelto en el cliente sin gastar IA |
| Escribir en la base | Cliente, con los servicios existentes, solo tras "Aplicar" |

## 3. Modelo (dominio puro, `src/domain/dayPlan.ts`)

```ts
/** Cómo ocupa a la persona: decide qué se puede hacer a la vez. */
type AttentionMode =
  | 'focus'    // requiere toda la atención: reunión, estudiar, escribir, llamada
  | 'physical' // ocupa el cuerpo, deja libre el oído: gimnasio, manejar, caminar, cocinar
  | 'routine'  // tarea mecánica: lavar platos, ordenar, doblar ropa
  | 'audio'    // solo escuchar: pódcast, audiolibro, clase grabada

type DayItemSource = 'new' | 'event' | 'session' | 'habit'

interface DayItem {
  ref: string            // 'new:1' | 'event:<id>' | 'session:<key>' | 'habit:<id>:<slot>'
  source: DayItemSource
  title: string
  fixed: boolean         // hora exacta que no se mueve (reunión, recoger a los niños)
  start: string | null   // 'HH:MM'; obligatoria si fixed
  durationMin: number    // 5–600; default 30 si nadie lo dijo (y se registra como supuesto)
  window: 'morning' | 'afternoon' | 'evening' | null
  mode: AttentionMode
  goalId: string | null  // solo ids de metas activas recibidas en el contexto
  /** Ref del ítem con el que la persona confirmó que lo hace a la vez. */
  alongside: string | null
  untimed: boolean       // "cuando pueda", sin hora: se guarda como tarea
  /** Hora que tenía un ítem existente antes del borrador (para "Movido de…"). */
  originalStart?: string | null
}
```

Los ítems existentes entran con su hora actual: eventos con hora `fixed: true`;
sesiones y repeticiones de hábito `fixed: false` pero ancladas a su hora (solo se
mueven si chocan con algo fijo o si la IA/persona lo pide). Días completos y
tareas existentes se envían como contexto para no duplicarlos, pero no se colocan.

### 3.1 Compatibilidad (multitarea)

`canOverlap(a, b)` es verdadero si:
- uno es `audio` y el otro `physical` o `routine` (manejar + pódcast), o
- ambos son `routine`, o
- la persona lo confirmó (`alongside` apunta al otro).

Dos `focus` nunca. Un `focus` con cualquier cosa, solo si la persona lo confirmó.
La IA puede sugerir combinaciones en su texto, pero el solape solo ocurre si la
regla lo permite.

### 3.2 Colocación — `planDay(input): DayPlan`

Entrada: `items`, `date`, `nowMin` (si es hoy), `dayStart` y `dayEnd` (por defecto
06:00 y 22:00; se amplían solos para incluir cualquier ítem fijo fuera del rango),
`bufferMin` (10).

1. Coloca los fijos en su hora.
2. Coloca los anclados (existentes no fijos) en su hora si no chocan de forma
   incompatible con un fijo; si chocan, pasan a la cola de flexibles.
3. Ordena los flexibles: con ventana antes que sin ventana; luego los más largos.
4. Primer hueco que quepa dentro de su ventana (mañana 06–12, tarde 12–18,
   noche 18–fin), respetando `bufferMin` entre ítems y sin empezar antes de
   `nowMin`. Si no cabe en su ventana, el primer hueco del día con
   `outsideWindow: true`. Si un ítem `audio` puede ir sobre un `physical`/
   `routine` ya colocado, se coloca encima (no consume hueco).
5. Si no cabe en ninguna parte → conflicto `no_room`.

Salida:
```ts
interface PlacedItem { ref: string; start: string; end: string; status: 'new' | 'moved' | 'same'; from?: string; outsideWindow?: boolean; overlapsWith: string[] }
type DayConflict =
  | { kind: 'fixed_overlap'; a: string; b: string }   // dos fijos incompatibles a la vez
  | { kind: 'no_room'; ref: string; freeMin: number } // no cabe; freeMin = mayor hueco libre
interface DayPlan { placed: PlacedItem[]; untimed: string[]; conflicts: DayConflict[] }
```

Reutiliza `timeToMinutes`/`minutesToTime` (`commitment.ts`). Para los huecos se
agrega `freeIntervals(busy, dayStartMin, dayEndMin)` con los bordes del día
(antes del primero y después del último), que hoy `freeGapsMinutes` no cubre.

### 3.3 Preguntas del algoritmo — `conflictQuestions(plan, items): DayQuestion[]`

```ts
interface DayQuestion { id: string; text: string; options: DayOption[]; from: 'plan' | 'ai' }
type DayOption =
  | { label: string; effect: DayEffect }   // preguntas del algoritmo: se aplican en el cliente
  | { label: string; reply: string }       // preguntas de la IA: la respuesta vuelve a la IA
type DayEffect =
  | { kind: 'alongside'; ref: string; with: string }   // "Sí, a la vez"
  | { kind: 'split'; ref: string }                     // partir en dos bloques
  | { kind: 'shorten'; ref: string; minutes: number }  // ajustar al hueco libre
  | { kind: 'drop'; ref: string }                      // dejarlo para otro día (no se agenda)
  | { kind: 'untimed'; ref: string }                   // dejarlo como tarea sin hora
```

- `fixed_overlap`: "La reunión (9:00–11:00) y la llamada al banco (10:00) chocan.
  ¿Puedes hacerlas a la vez?" → Sí, a la vez / Dejar la llamada sin hora / Quitar la llamada.
- `no_room`: "La tesis (2 h) no cabe completa hoy. ¿Qué hacemos?" →
  Partirla en dos bloques / Hacer solo {freeMin} min / Dejarla como tarea sin hora /
  Pasarla a otro día.

Máximo 3 preguntas visibles a la vez entre IA y algoritmo; las del algoritmo
primero (son reales). Aplicar un efecto recalcula el plan al instante, sin gastar
cuota.

### 3.4 Aplicación — `planToOps(plan, items, before): DayOp[]`

Función pura que traduce el borrador en operaciones; el cliente las ejecuta en
orden con los servicios existentes y guarda la inversa de cada una para deshacer.

| Caso | Operación | Servicio | Inversa |
|---|---|---|---|
| Nuevo, con meta | crear sesión con hora | `createSpontaneousSession` (+ hora en el mismo insert) | `deleteSession` |
| Nuevo, sin meta, con hora | crear evento | `createEvent` | `deleteEvent` |
| Nuevo, `untimed` | crear tarea | `createUserTask` | `deleteTask` |
| Evento movido | mover desplazando el fin | `updateEvent` | `updateEvent` con la hora previa |
| Sesión movida | hora del día | `setSessionPlannedTime` (materializa si es proyectada) | hora previa |
| Repetición de hábito movida | excepción del día | `setHabitDayTimes` (mismas repeticiones) | override previo o `clearHabitDayOverride` |
| Ítem `drop` | nada (no se agenda) | — | — |

Ítems existentes nunca se borran en esta fase. Si una operación falla, se detiene,
se informa cuál, y "Deshacer" revierte las que sí se hicieron.

## 4. Servidor: acción `day` en `/api/plan-meta`

- Nueva acción en `ACTIONS` (`src/server/planMeta.ts`). No exige `title` de meta:
  `readCoachRequest` valida `day` por su propia rama (`readDayRequest`).
- Cuerpo: `{ action: 'day', date, now, items: DayItem[] (existentes y borrador),
  goals: {id,title}[], history: ChatTurn[], message }`. `message` hasta 1.500
  caracteres (un día contado de corrido es largo); `history` hasta 12 turnos.
  Solo viajan títulos, horas y duraciones: nada de notas.
- `GoalPlanner` gana `day(ctx, history, message)`. `call()` recibe el `system` por
  parámetro (hoy fijo en `COACH_SYSTEM`, `goalPlanner.ts:62`); la agenda usa
  `DAY_SYSTEM` propio.
- Respuesta de la IA (esquema estilo Gemini, validado en código):
  ```
  { reply: string,                       // 1–2 frases, español neutro
    items: [{ ref, title, fixed, start, end, durationMin, window, mode, goalId, untimed, alongside }],
    questions: [{ text, options: string[] }],   // 0–3, 2–4 opciones
    assumptions: string[],               // "Supuse 1 h para el gimnasio"
    removed: string[] }                  // refs "new:N" que la persona pidió quitar
  ```
  `items` trae solo lo nuevo y lo que cambia (por `ref`); lo que no se menciona
  queda igual y solo sale del borrador lo que viene en `removed`. (Primero se
  pidió la lista completa, pero en la prueba con el modelo real una corrección
  devolvía solo lo cambiado y el borrador perdía el resto.) `durationMin` es
  obligatoria en el esquema; si viene un rango `start`–`end`, la duración sale
  de ahí. Algo con meta, ventana u hora fija nunca queda como tarea sin hora.
- `parseDayReply(raw, ctx)`: horas `HH:MM` válidas, duración 5–600, `ref`
  existente o `new:N`, `goalId` dentro de las metas recibidas (si no, null), un
  `fixed` sin hora pasa a flexible, máx. 20 ítems nuevos, máx. 3 preguntas,
  títulos recortados. Inválido → `null` → la cadena prueba el siguiente modelo.
  El cliente además conserva siempre los ítems existentes (`mergeAiItems`).
- Cuenta 1 de cuota por turno, con devolución si falla (igual que el resto).

### 4.1 Prompt (reglas clave)

- Fecha y hora actuales, día de la semana, límites del día, metas activas, lo que
  ya hay en el día con su `ref`.
- Distinguir fija ("a las 4", "de 9 a 11", "recoger") de flexible ("quiero",
  "avanzar", "en algún momento"). "Por la mañana/tarde/noche" es ventana, no hora.
- Si falta un dato que cambia el plan y no hay un supuesto razonable, preguntar
  (máx. 3, en un solo turno, con opciones cortas). Si hay un supuesto razonable,
  usarlo y dejarlo en `assumptions`. No preguntar lo que la persona ya dijo.
- Preguntar siempre la duración de bloques de trabajo profundo sin duración
  (tesis, estudio): es la que más cambia el día.
- Clasificar `mode` según §3.1. No decidir solapes: eso lo hace el código.
- No inventar horas para flexibles; no tocar lo existente salvo que la persona lo
  pida o choque con algo fijo nuevo.
- Español neutro sin voseo ni modismos.

## 5. Cliente

### 5.1 Entrada
- Calendario, vista Día (días de hoy en adelante): botón ✦ "Organizar con IA"
  junto a "Reorganizar el día" (`Calendar.tsx:784`).
- Hoy: acción "Organizar mi día" que navega a `/calendario?d=<hoy>&organizar=1`;
  el Calendario abre la hoja al leer el parámetro.

### 5.2 Hoja `DayPlannerSheet` (archivo propio en `src/screens/calendar/`)

Orden de arriba abajo, chat siempre visible:
1. Título "Organizar el {día}" y una línea: "Cuéntame qué tienes y qué quieres
   hacer. Nada se guarda sin tu sí."
2. Conversación: mensajes de la persona y respuestas de la IA (`CoachOrb`).
3. Preguntas en línea (algoritmo primero), cada una con opciones como botones y
   "Otra respuesta" que abre texto libre.
4. Borrador del día: bloques en el formato de la agenda (`groupIntoBlocks`), cada
   ítem con su rango y una etiqueta Nuevo / Movido de 7:00 / A la vez con… /
   Fuera de su momento. Tocar un ítem permite cambiar hora, duración y
   fija/flexible. Supuestos visibles como texto pequeño editable.
   "Sin hora" al final para las tareas.
5. Compositor multilínea (hasta 1.500 caracteres; `CoachComposer` gana
   `multiline` y `maxLength`). Nunca se deshabilita mientras la IA piensa: solo
   el botón de enviar (lección del 6-nov).
6. Pie fijo: "Aplicar (N cambios)"; tras aplicar, "Deshacer" y "Listo".

Estado (hook `useDayPlanner`): `messages`, `draftItems`, `aiQuestions`,
`assumptions`, `plan` (derivado con `planDay` en cada cambio), `pending`, `error`,
`applied: DayOp[]` (para deshacer). La conversación vive mientras la hoja está
abierta; no se persiste en esta fase.

### 5.3 Estados y errores
- Sin IA configurada / límite diario / error: mensaje del mapa `ERRORS` existente
  y enlace a "Reorganizar el día" (manual). El borrador ya armado no se pierde.
- Día sin nada: el borrador vacío dice "Tu día está libre. Cuéntame qué quieres hacer."
- Cerrar con cambios sin aplicar: confirmación dentro de la hoja (no `confirm()`).

## 6. Deuda que se paga en esta fase

- `goalPlanner.call()` con `system` por parámetro.
- `freeIntervals` con bordes del día en `agenda.ts` (con tests).
- `createSpontaneousSession` acepta `plannedTime` en el mismo insert (hoy son dos
  escrituras no atómicas cuando se le quiere poner hora).
- La hoja nueva fuera de `Calendar.tsx` (1.881 líneas).

## 7. Pruebas

- Unitarias (`dayPlan.test.ts`): compatibilidad, colocación (fijos, anclados,
  ventanas, buffer, "ahora", audio encima de físico, ampliación de límites),
  conflictos y sus preguntas, efectos, `planToOps` e inversas, `parseDayReply`
  (horas inválidas, refs inventados, metas ajenas, límites), prompt contiene
  fecha/hora y refs.
- Servidor: `planMeta.test.ts` (acción `day` válida, 400 sin `message`, cuota y
  devolución), `goalPlanner.test.ts` (`day` usa `DAY_SYSTEM`).
- E2E (`e2e/coach-chat`-style con `e2e/fixtures/ai.ts`): abrir desde el
  Calendario, escribir el día, ver borrador, responder pregunta del algoritmo,
  aplicar, deshacer; el campo de texto sigue usable mientras responde.
- `npm run typecheck`, `lint`, `test`, `check:api`; capturas móvil y escritorio.

## 8. Riesgos

- Extracción errónea de la IA: el algoritmo no la detecta → supuestos visibles y
  edición directa de cada ítem.
- Latencia por turno (sin streaming): el borrador se recalcula localmente al
  instante; solo el texto libre espera a la IA.
- Privacidad: los títulos del día viajan al proveedor. En el nivel gratuito de
  Gemini se usan para entrenar; para usuarios reales, cuenta de pago primero.

- Deshacer el movimiento de una sesión proyectada le devuelve la hora, pero la
  deja materializada (fila real), como "Reorganizar el día" a mano: si después
  cambia el bloque semanal, ese día ya no lo sigue.
- Un existente que no cabe solo ofrece "Dejarla a su hora" (no se borra ni se
  pasa a otro día en esta fase); su duración no se edita salvo en eventos.
  Un existente sin hora no recibe una por abrir la hoja.

## 9. Pendiente del usuario (fuera de esta fase)

- Correr la migración `0020_ai_quota.sql` (tabla `ai_usage` + funciones
  `ai_quota_take` / `ai_quota_refund`). Mientras no corra, el servidor usa el
  límite en memoria por instancia (como antes).
- Fase 2 (voz): usa la `GROQ_API_KEY` que ya tiene la cadena; probar en iPhone real.
- Gemini de pago antes de abrir a usuarios reales (en pruebas, nivel gratuito con
  datos ficticios).
- Fase 3 (memoria del horario, combinaciones confirmadas, origen IA): migración.
