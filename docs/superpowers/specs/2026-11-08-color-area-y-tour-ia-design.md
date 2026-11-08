# Color por área en eventos y tareas, y tour de "Organizar con IA"

Fecha: 2026-11-08. Pedido del usuario: lo que crea la IA se ve gris, y la gente
no sabe cómo usar "Organizar con IA".

## 1. Color por área

**Problema.** `events` y `tasks` no guardan área. En la agenda, todo evento sin
meta toma el tono `otra` (gris); las tareas sueltas de Hoy, un ícono gris.

**Decisión (del usuario).** La IA elige el área de cada actividad nueva, y
ninguna tarea o evento suelto se ve gris.

- Migración `0022_area_eventos_tareas.sql`: columna `area text null` en `events`
  y `tasks`, con `check` sobre las áreas de `NicheId`. Las tablas ya tienen RLS;
  no cambian las políticas. La corre el usuario en Supabase.
- IA: `DayItem.area` (solo ítems nuevos). El esquema de respuesta agrega `area`
  con el enum de áreas y una regla del prompt explica cuál elegir. Un valor
  inválido se descarta.
- Las operaciones `createEvent` y `createTask` llevan `area`, y los servicios lo
  guardan. Si la columna aún no existe (migración sin correr), se guarda sin área
  en lugar de fallar.
- Color de una fila: meta → color de la meta; si no, su `area`; si no tiene
  (datos de antes), un área de la paleta elegida de forma estable por el título.
  `otra` (gris) ya no se usa como respaldo de eventos ni tareas.
- Editor de eventos: selector de área para cambiar el color.
- El borrador del organizador muestra cada ítem con el color de su área.

## 2. Tour paso a paso

**Decisión (del usuario).** Tour interactivo con globos la primera vez. Reemplaza
la regla anterior de `useFirstTimeHint` ("nunca tour") solo para esta función.

Pasos (cada uno señala un elemento real con `data-tour`):

1. Botón "Organizar mi día con IA" (Hoy) o "✦ IA" (Agenda). Tocar el botón
   avanza.
2. Cuadro de texto de la hoja: "Cuéntame tu día con tus palabras", con un
   ejemplo que se toca y llena el cuadro.
3. Preguntas de la IA (cuando aparecen): responder tocando una opción.
4. Botón "Aplicar": nada se guarda hasta aquí y se puede deshacer.

- Si un paso no tiene su elemento en pantalla, el tour espera; "Saltar" lo cierra
  para siempre. Terminar o saltar se guarda en `localStorage`.
- La hoja tiene "¿Cómo funciona?" para repetir los pasos 2 a 4.
- Accesible: el globo es un `dialog` no modal con foco en su botón, Escape lo
  cierra, y con `prefers-reduced-motion` no anima.

## Pendiente del usuario

- Correr `supabase/migrations/0022_area_eventos_tareas.sql` en Supabase. Sin ella
  todo funciona, pero los colores elegidos por la IA no se guardan.
