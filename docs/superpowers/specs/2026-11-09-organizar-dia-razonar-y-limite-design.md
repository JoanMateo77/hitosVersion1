# Organizar el día: la IA razona qué va a la vez y respeta la hora límite

Fecha: 2026-11-09. Pedido del usuario tras organizar una tarde de trabajo:

> "Organicemos mi día de aquí a las cinco y media… Evalúa poner varias tareas a la
> vez, ya que yo pongo los agentes a auditar al mismo tiempo con IA. La de revisar
> la demo sí debo hacerla manual: un espacio exclusivo para leerla."

Resultado: cinco bloques en fila, ninguno a la vez y tres después de las 5:30 pm.
El usuario insistió tres veces sin efecto.

## 1. Causas (reproducidas con el modelo real, 4 corridas de la misma conversación)

1. **La hora límite no existe en el contrato.** `useDayPlanner` manda y planea con
   `DAY_DEFAULTS.dayEnd` (22:00). La IA no tiene dónde poner "hasta las 5:30". Responde
   "hasta las 5:30 pm", pero el plan sigue de largo.
2. **La IA tiene prohibido razonar el paralelo.** El prompt dice "No decidas por tu
   cuenta qué se hace a la vez" y solo junta cosas ante frases literales ("a la vez",
   "mientras"). Una razón ("los agentes trabajan por mí") no cuenta.
3. **"A la vez" solo admite parejas.** `alongside` es un único ref:
   - si la IA manda `"new:3,new:5"`, se descarta entero;
   - si tres ítems apuntan al mismo ancla, `canOverlap` (por pares) impide que los
     otros dos compartan tiempo entre sí y se ponen en fila.
4. **Las parejas viejas no se pueden deshacer.** `null` en `alongside` no limpia nada.
   Una pareja que la persona no pidió (demo de Hunter + hallazgos) queda pegada.
5. **No hay "exclusivo".** Nada impide que una tarea manual comparta tiempo.

## 2. Principios

- **La IA razona con lo que la persona cuenta** y explica en una frase por qué juntó
  o separó cosas. Si lo hace la IA o corre sola, no ocupa a la persona; si la persona
  dice que lo hace a mano o lo lee ella, es exclusivo.
- **La persona decide el tiempo.** La IA estima duraciones, pero no juzga si algo es
  posible hoy. Si no cabe, se pregunta; nunca se recorta ni se descarta solo.
- **El límite es duro.** Nada flexible se ubica después de la hora límite.

## 3. Cambios

### 3.1 Hora límite del borrador
- La respuesta de la IA suma `limits: { start?: "HH:MM", end?: "HH:MM" }`, opcional,
  cuando la persona acota el día ("de aquí a las 5:30", "hasta las 6", "desde las 2").
- El hook guarda el límite en el estado del borrador, lo manda en `dayStart`/`dayEnd`
  en los siguientes turnos y se lo pasa a `planDay`. Un turno nuevo puede cambiarlo.
- `planDay` no ubica nada flexible fuera del límite (ya lo hace con `dayEnd`). Los fijos
  de la persona conservan su hora aunque queden fuera: los dijo ella.
- La hoja muestra el límite ("Hasta las 5:30 pm") sobre el borrador.

### 3.2 Si no cabe: preguntar, no decidir
- Lo que no cabe genera la pregunta `no_room` de siempre, con la hora en el texto:
  "No cabe todo antes de las 5:30 pm. Pulir demo de inglés (1 h) no entra. ¿Qué hacemos?"
- Opciones: "Me alcanza con N min" (lo que queda libre), "Partirla en dos",
  "Dejarla como tarea sin hora", "Pasarla a otro día". No se agrega "ampliar el
  límite": si la persona quiere, lo dice en el chat.
- Prompt: la IA no opina sobre si algo alcanza ni recorta duraciones que dijo la
  persona; si la duración es suya (estimada), la anota en `assumptions`.

### 3.3 Grupos "a la vez" (reemplaza `alongside`)
- `DayItem.alongside: string | null` pasa a `together: string | null`, un id de grupo
  (`"g1"`). Todos los del mismo grupo pueden compartir tiempo entre sí, sin importar
  cuántos sean.
- `canOverlap(a, b)`: si alguno es `solo` → false; si comparten grupo → true; si no,
  las reglas de modo de atención de siempre.
- Ubicación: el primer miembro del grupo se ubica normal y los demás empiezan con él
  (lo que hoy hace `besidePartner`, pero por grupo).
- `applyEffect('alongside')` ("Sí, a la vez" en un choque) une los dos en un grupo
  (el existente de cualquiera de los dos o uno nuevo).
- El contrato con la IA: `together` (string). Un `null` o `""` explícito en un ítem
  devuelto **saca** al ítem de su grupo; si no viene el campo, queda igual. Un grupo
  con un solo miembro se disuelve.

### 3.4 Exclusivo
- `DayItem.solo: boolean`: no comparte tiempo con nada, ni siquiera con un audio. Lo
  marca la IA cuando la persona dice que lo hace a mano, lo lee ella, necesita toda
  la cabeza o pide "un espacio exclusivo". `solo` y `together` no conviven: `solo` gana.
- La tarjeta del borrador muestra "Solo para ti" y, en lo agrupado, "A la vez con X"
  (como hoy).

### 3.5 Prompt: razonar en vez de esperar palabras clave
Se reemplaza la regla de `alongside` por:
- Agrupa con `together` cuando la persona lo pide **o da una razón**. Ejemplos:
  - "lo hace la IA" / "agentes" / "corre solo" / "en segundo plano": esa tarea no
    ocupa a la persona y va junto con una que sí la ocupa.
  - "mientras", "a la vez", "en paralelo": se juntan aunque las dos pidan concentración.
- `solo=true` para lo que la persona hace a mano o pide exclusivo. "X y Y" a secas
  siguen siendo seguidas.
- Si la persona corrige un grupo, devuelve los ítems afectados con su nuevo
  `together` (o `null` para sacarlos).
- `reply` explica en una frase lo que decidió y por qué ("Junté la auditoría con los
  hallazgos de QA porque los agentes trabajan mientras tú avanzas; dejé la demo de
  Hunter sola para que la leas con calma").
- Se quita "No decidas por tu cuenta qué se hace a la vez".

## 4. Fuera de alcance
- Un modo de atención nuevo "lo hace la IA": se cubre con grupos razonados. Con un
  modo, la app juntaría por regla sin entender la razón.
- Guardar el límite del día entre sesiones o como ajuste del perfil.
- Cambiar cómo se guarda en la agenda: los grupos ya se ven como un bloque con varias
  cosas (`AgendaBlock`), porque comparten horario.

## 5. Pruebas
- `dayPlan.test.ts`: un grupo de 3 empieza junto; `solo` no comparte ni con un audio;
  nada flexible pasa de `dayEnd`; la pregunta `no_room` menciona el límite; "Sí, a la
  vez" une los dos en un grupo existente.
- `dayPlanAi.test.ts`: lee `limits`, `together` y `solo`; `null` saca del grupo; un
  grupo de un solo miembro se disuelve; `solo` gana sobre `together`; hora inválida
  en `limits` se ignora.
- Hook: el límite persiste entre turnos y viaja en el pedido.
- Evaluación con el modelo real (script local, fuera de CI): la conversación de este
  spec, 5 corridas. Criterio: en todas, nada flexible después de las 5:30 pm, la
  auditoría junto a los hallazgos de QA, y la demo de Hunter sola.
- Navegador: hoja en móvil y escritorio con el límite, una tarjeta "Solo para ti" y
  un grupo de 3.
