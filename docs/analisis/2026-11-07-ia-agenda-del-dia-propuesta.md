# IA para organizar la agenda del día — evaluación y propuesta

Fecha: 2026-11-07. Estado: propuesta, sin aprobar. Nada construido.

Dolor del usuario: a una persona ocupada le cuesta mucho acomodar el día. Quiere
contárselo a la app escribiendo o hablando y que una IA le ayude a organizarlo,
con preguntas de validación sobre horas, duraciones y qué cosas puede hacer a la vez.

## 1. Diagnóstico (verificado en el código)

1. **La agenda es 100 % determinista y ya permite multitarea visual.** `groupIntoBlocks`
   (`src/domain/agenda.ts:188`) agrupa ítems que se solapan en un bloque desplegable;
   un ítem sin fin cuenta 30 min (`agenda.ts:149`). Pero "se puede hacer a la vez" no
   es un dato: solo es solape de horas.
2. **El ajuste manual ya existe y es la puerta natural.** "Reorganizar el día"
   (`src/screens/Calendar.tsx:784`, `ReorganizeSheet` en `:1236`) cambia con clics las
   horas de sesiones, hábitos y eventos de una fecha. `Calendar.tsx` tiene 1.881 líneas:
   lo nuevo debe ir en componentes aparte.
3. **Los huecos libres solo se calculan entre ítems** (`freeGapsMinutes`,
   `agenda.ts:117`): no existe el hueco antes del primero ni después del último, ni
   límites del día (despertar/dormir). Un colocador de horas los necesita.
4. **Faltan datos de planificación.** `tasks` no tiene hora ni duración
   (`supabase/schema.sql`); no hay hora fija vs flexible, prioridad, compatibilidad ni
   horario de la persona. `habit_day_overrides` solo mueve horas, mismo número de
   repeticiones (`0015`).
5. **La IA actual es reutilizable casi entera.** Un endpoint (`api/plan-meta.ts`) con
   acciones en un `Set` (`src/server/planMeta.ts:21`), cadena de modelos con JSON por
   esquema y respaldo (`src/server/aiChain.ts`), auth por token, cuota con devolución y
   el patrón "la IA propone, la persona aplica" (`src/domain/coachChat.ts`, estado
   `pending|applied|dismissed`). Límite: `call()` fija `COACH_SYSTEM`
   (`src/server/goalPlanner.ts:62`), la cuota vive en memoria por instancia
   (`planMeta.ts:176`) y la conversación no tiene estado en servidor.
6. **No hay voz en ningún lado** (sin SpeechRecognition, MediaRecorder ni transcripción).

## 2. Lecciones de las conversaciones anteriores que esta función debe respetar

- La IA propone y la persona interviene bastante; nada se guarda sin "Aplicar".
- El chat no se esconde: preguntas en línea, visibles, con respuestas rápidas y texto
  libre; "que no le dé miedo preguntar", pero sin repetir lo ya dicho.
- Las cuentas (tiempos, choques, viabilidad) se hacen en código puro en `src/domain/`;
  la IA extrae, pregunta y narra. La auditoría de mayo exigió justificar la IA frente
  a reglas: aquí se justifica porque entender texto libre o hablado es justo lo que las
  reglas no hacen.
- Darle contexto exacto: fecha y hora actuales, lo que ya está en el día.
- Cadena con respaldo, validación estricta en servidor, una reparación y degradar sin
  romper. Imports `.js` y `npm run check:api`. Español neutro, sin modismos.
- El campo de escribir no puede bloquearse (regresión vista el 6-nov): prueba e2e.

## 3. Lo que hacen las herramientas maduras (investigación web)

- Motion y similares separan **evento fijo** (hora exacta) de **tarea flexible**
  (duración, ventana); sin duración no agendan, usan 30 min por defecto editable.
  https://www.usemotion.com/help/time-management/auto-scheduling
- Morgen y Sunsama muestran un **borrador para revisar antes** de tocar el calendario;
  Reclaim aplica sin preguntar (lo que no queremos). https://www.morgen.so/blog-posts/ai-planner
- Todoist Ramble: dictado con **corrección hablada** ("en realidad quise decir…").
  https://www.todoist.com/help/todoist/todoist-and-ai/dictate-to-add-tasks-with-ramble-P1Raq7vVF
- Los LLM fallan en ubicar con restricciones (NATURAL PLAN, ~49 % en calendario,
  https://arxiv.org/pdf/2406.04520; modelos recientes mejoran en casos simples,
  https://arxiv.org/pdf/2512.09629). Patrón recomendado: LLM extrae, algoritmo coloca.
- Preguntar solo cuando hay duda real: en Alexa la primera hipótesis era correcta el
  77 % de las veces. https://www.amazon.science/blog/reducing-unnecessary-clarification-questions-from-voice-agents
- Ninguna herramienta revisada hace preguntas de validación sistemáticas: es un
  diferencial real, si se hacen bien.
- Multitarea: escuchar audio durante actividad física o rutinaria funciona
  (temptation bundling, Milkman 2014, https://ideas.repec.org/a/inm/ormnsc/v60y2014i2p283-299.html);
  dos tareas de lenguaje o atención a la vez, no. La persona confirma, la IA no impone.

## 4. Propuesta por piezas

### 4.1 Flujo: "Cuéntame tu día" → borrador → preguntas → Aplicar
1. Botón ✦ "Organizar mi día con IA" en la vista Día del Calendario (junto a
   "Reorganizar el día") y en Hoy. Abre un `Sheet` con el chat visible y un campo de
   texto con micrófono.
2. La persona vuelca todo: "reunión de 9 a 11, gimnasio, recoger a los niños a las 4,
   quiero avanzar la tesis, llamar al banco".
3. La app responde con un **borrador del día** en el mismo formato de bloques de la
   agenda, marcando cada ítem como nuevo, movido o sin cambios, más **1 a 3
   preguntas** en línea con opciones rápidas.
4. La persona responde o corrige ("en realidad el gimnasio es a las 7") y el borrador
   se recalcula.
5. "Aplicar" escribe todo; "Deshacer" lo revierte mientras siga en la hoja.

Origen: dolor del usuario + Morgen (borrador) + Ramble (corrección) + decisión del coach
(nada sin "sí").

### 4.2 Reparto IA / código (la decisión central)
- **IA (acción nueva `day` en `plan-meta`)**: convierte el texto en ítems estructurados:
  `{title, fixed|flexible, start?, end?, durationMin?, window?(mañana/tarde/noche),
  priority, mode(focus | hands | audio-ok | passive), linkTo?(id de meta, hábito o
  evento existente)}`, más `assumptions[]` ("supuse 1 h de gimnasio") y preguntas
  sobre datos que faltan y cambian el resultado.
- **Código puro (`src/domain/dayPlanner.ts`)**: coloca los flexibles en los huecos entre
  fijos respetando ventana, límites del día y márgenes; detecta choques; propone
  combinar solo si un ítem es `audio-ok/passive` y el otro no exige atención
  (manejar + pódcast sí, reunión + tesis no). Si algo no cabe o dos fijos chocan,
  **genera la pregunta él mismo** ("La tesis no cabe completa: ¿la partimos en dos
  bloques de 45 min o la pasamos a mañana?").

Resultado: las preguntas salen de dos fuentes con criterio: ambigüedad del texto (IA) y
conflicto real del día (algoritmo). Así la IA pregunta lo necesario y no inventa horas.

### 4.3 Conversación sin estado en servidor
El cliente reenvía en cada turno: contexto del día (eventos, sesiones, hábitos que
tocan, tareas, hora actual), borrador actual y respuestas. Sigue el patrón de
`useCoachChat`; el servidor valida contra el estado real como `parseCoachReply`.

### 4.4 Aplicar con lo que ya existe (sin migración en la fase 1)
- Fijo nuevo → `createEvent`. Bloque de meta → sesión con hora. Hábito → solo mover
  horas con `setHabitDayTimes`. Sin hora → `createUserTask`. Evento existente movido →
  `updateEvent`.
- La multitarea no se guarda como dato: queda como solape, que la agenda ya muestra
  agrupado.
- Deshacer de la sesión: la hoja guarda los IDs creados y los valores previos.

### 4.5 Voz
Grabar con `MediaRecorder` y transcribir en servidor con Groq Whisper large-v3-turbo
(oficial: US$0,04 por hora de audio; cifra tomada de un resumen de búsqueda, hay que
confirmarla en https://console.groq.com/docs/model/whisper-large-v3-turbo). El texto
transcrito cae en el campo para que la persona lo vea y lo corrija antes de enviar.
Web Speech API se descarta como vía principal: en la PWA instalada en iPhone no es
fiable (https://bugs.webkit.org/show_bug.cgi?id=225298); hay que probar en un iPhone
real el formato de audio de Safari (normalmente mp4/aac).

## 5. Descartado
- **Que el LLM arme las horas del día completo**: frágil con restricciones y no se
  puede probar con tests.
- **Aplicar sin confirmar (estilo Reclaim)**: contradice la decisión vigente del coach.
- **Preguntar todo en cascada**: cansa; se pregunta en un solo bloque de 1 a 3.
- **Reusar `goal_coach_messages`**: exige `goal_id`; la conversación del día es efímera
  en la fase 1.

## 6. Fases (cada una usable por sí sola)
1. **Texto → borrador → preguntas → Aplicar/Deshacer.** `dayPlanner.ts` con tests,
   acción `day`, hoja nueva, aplicador sobre servicios existentes, e2e del flujo y del
   campo de texto. Límites del día por defecto 06:00–22:00, preguntados si la persona
   habla de algo fuera de ese rango. Sin migración.
2. **Voz.** Micrófono + transcripción en servidor. Requiere `GROQ_API_KEY` en Vercel.
3. **Memoria del horario.** Guardar despertar/dormir, horario laboral y lo que la
   persona confirmó que combina (p. ej. "gimnasio + pódcast"), para no volver a
   preguntarlo. Marca de origen IA en eventos para deshacer después. Requiere migración.
4. **Replanificar en vivo desde Hoy**: "se me corrió la reunión una hora" → la app
   reacomoda lo que queda del día.

## 7. Deuda que se paga en el camino (dentro del alcance)
- Parametrizar el `system` en `goalPlanner.call()` (hoy fijo en `COACH_SYSTEM`).
- Huecos libres con bordes del día (antes del primero y después del último ítem).
- Crear sesión con hora en una sola escritura (hoy son dos llamadas no atómicas:
  `createSpontaneousSession` + `setSessionPlannedTime`).
- La hoja nueva fuera de `Calendar.tsx`.

## 8. Pendiente que requiere decisión del usuario
- **Cuota diaria persistente** (hoy en memoria por instancia; con varios turnos y voz
  se gasta más). Migración.
- **Migración de la fase 3** (horario de la persona, combinaciones confirmadas, origen IA).
- **Clave Groq en Vercel** para la voz.
- Privacidad: el nivel gratuito de Gemini usa los datos para entrenar; una agenda
  contiene datos personales (niños, citas). Para usuarios reales, Gemini de pago primero.

## 9. Riesgos y costos
- Latencia: cada turno es una llamada (flash-lite medido en ~0,8 s el 5-nov;
  presupuesto máximo 45 s). Sin streaming; el borrador se calcula al instante en el
  cliente una vez llega el JSON.
- Calidad de extracción: el algoritmo no puede verificar lo que la IA entendió mal; por
  eso los supuestos se muestran y se editan.
- Voz en iPhone: comprobar en dispositivo real antes de dar la fase 2 por lista.
