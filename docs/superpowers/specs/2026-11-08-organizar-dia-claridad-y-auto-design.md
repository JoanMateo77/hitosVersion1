# Organizar el día: lo nuevo a la vista, texto honesto, multitarea y modo automático

Fecha: 2026-11-08. Pedido del usuario tras usar "Organizar el día con IA":
el botón Aplicar no se nota, lo nuevo se pierde en el borrador, la IA dice "ya lo
programé" sin haber guardado nada, quiere un modo que aplique solo y quiere juntar
dos tareas de concentración cuando lo pide ("pruebas de seguridad mientras
desarrollo").

## 1. Multitarea pedida por la persona

- Hoy `alongside` permite el solape, pero un flexible con `alongside` va al primer
  hueco libre, no junto a su pareja.
- Cambio: un ítem cuya pareja ya está colocada se ubica a la misma hora de inicio
  que ella, siempre que no choque con nada incompatible y quepa en el día. Si no
  se puede, sigue la regla normal. Las parejas se colocan después de su ancla.
- Prompt: `alongside` cuando la persona dice que hace dos cosas juntas ("a la vez",
  "mientras", "al mismo tiempo", "en paralelo", "junto con"), sin importar el tipo
  de atención. "X y Y" a secas son dos cosas seguidas.

## 2. Texto honesto

- La IA no dice que guardó o programó: propone ("Te propongo…", "Quedaría…"). Regla
  en el prompt y lectura defensiva: si la respuesta dice "programé/agendé/guardé/
  agregué/añadí", el cliente la reescribe a "Te propongo esto:" antes del resumen.
  Solo cuenta como hecho después de aplicar.

## 3. Lo nuevo a la vista

- Arriba del borrador: "Esto se agregará a tu día" (y "Esto cambia de hora"), con
  tarjetas del color del área, hora y etiqueta "Nuevo"/"Movido".
- Al llegar cambios, la vista baja a esa sección.
- El resto del día queda plegado en "Ver el resto de tu día (N)", atenuado; un hábito
  de varias veces al día ocupa una línea con sus horas.
- Las preguntas (choques) siguen arriba, fuera del plegado.

## 4. Botón que dice qué hace

- "Agregar N a mi agenda" si solo agrega; "Guardar N cambios" si mueve algo.
- Sin cambios no se muestra el botón (no hay "Aplicar (0 cambios)").
- Un pulso suave cuando cambia la cantidad; sin animación con
  `prefers-reduced-motion`.

## 5. Modo automático

- Interruptor "Aplicar solo" en la hoja, apagado por defecto, recordado en el
  dispositivo (`localStorage`, sin SQL).
- Encendido: cuando la IA responde y no quedan preguntas, se aplica solo.
  Si hay preguntas, espera las respuestas y aplica al quedar sin preguntas.
- Mover o cambiar de hora algo que ya existía no se aplica solo: el borrador lo
  muestra en "Esto cambia de hora", avisa "Esto mueve cosas que ya tenías:
  revísalo y guarda" y espera el botón "Guardar N cambios".
- Se aplica una sola vez por respuesta de la IA: después de "Deshacer" no se
  vuelve a aplicar solo hasta la siguiente respuesta.
- Al aplicar, aviso fijo en la hoja: "Agregué N a tu día · Deshacer" (no se borra
  solo). Deshacer revierte todo lo aplicado en esa tanda.
- Como en el modo normal, aplicar cierra la conversación ("Deshacer" o "Listo");
  para agregar más se vuelve a abrir la hoja.

## Fuera de alcance

- Voz (fase 2 del organizador).
- Resaltar en la agenda lo recién agregado (se ve con su color; el aviso nombra lo
  agregado).
