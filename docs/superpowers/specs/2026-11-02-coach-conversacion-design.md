# Coach de la meta: conversación que avanza y avances desde el chat

Fecha: 2026-11-02 · Estado: aprobado por el usuario ("dale, arma la PR con eso").

## Problema
En una conversación real (meta de presupuesto, etapa 1 de 4) el coach:
1. Repitió la misma instrucción tres veces (ante "¿te basas en el primer paso?" y ante "sí").
2. No nombró la etapa ni explicó cómo el paso la mueve.
3. Ante "ya lo hice" felicitó pero no pidió el resultado (el total de gastos, que era el objetivo del paso) ni lo dejó registrado.
4. Anunció "sigamos con el siguiente movimiento" sin decir cuál.

Causa: el prompt del chat (`buildChatPrompt`, src/domain/coachChat.ts) solo da reglas para proponer cambios de etapas; ninguna de conversación.

## Decisión

### 1. Reglas de conversación en el prompt
- Ubica cada paso: nombra la etapa actual (la primera no cumplida) y en media frase por qué el paso la acerca.
- Nunca repitas tu respuesta anterior. Si la persona confirma ("sí", "dale", "ok", "listo para hacerlo"), avanza: ánimo breve y dile qué traer de vuelta ("cuando lo tengas, cuéntame el total").
- Si dice que ya lo hizo ("ya lo hice", "listo", "terminé"): celébralo en una frase, pide el resultado concreto si el paso producía un dato y aún no lo dio, y propón registrarlo como avance (campo `progress`).
- Nunca anuncies un paso sin decirlo en la misma respuesta.
- Si con lo contado la etapa actual parece cumplida, dilo y sugiere marcarla con el botón "Marcar esta etapa como cumplida" (el coach no la marca).
- El contexto ya trae `<etapas>` con "(cumplida)"; se añade `<etapa_actual>` explícita.

### 2. Registrar avance desde el chat
- La respuesta de la IA gana un campo `progress`: nota en primera persona y en pasado, máximo 140 caracteres ("Revisé mis gastos de la semana: 320.000"), vacío si no hay nada que registrar. Esquema JSON con `maxLength`; el servidor la vuelve a validar y recortar.
- La propuesta pasa a ser una unión: `{ kind: 'stages', summary, changes }` | `{ kind: 'progress', note }`. Una respuesta puede traer una de las dos (si trae ambas, se priorizan los cambios de etapas y la nota se descarta: una decisión por mensaje). Filas viejas sin `kind` se leen como `stages`.
- En el chat se muestra como las propuestas actuales: "Registrar avance" / "Ahora no". Nada se guarda sin el sí.
- Al aceptar (solo en el detalle de meta; en el asistente de nueva meta no hay meta todavía y el contexto lo indica con `canLogProgress: false`, así el prompt no propone avances):
  - Si hay una sesión de hoy de esa meta, la nota se guarda como su avance (`accomplishment`); si ya tenía uno, se agrega al final separado por " · " (máx. la longitud que permita la columna).
  - Si no hay, se crea una sesión espontánea de hoy y se cierra como hecha: el paso del coach fue el trabajo del día en la meta. Queda en "Tus avances" igual que los de una sesión.
- La nota es texto: se renderiza como texto, nunca HTML.

## Fuera de alcance
- Marcar etapas cumplidas desde el chat (sigue siendo el botón de la etapa).
- Cuota persistente de IA: PR propio (necesita migración).

## Verificación
- Tests de `buildChatPrompt` (reglas presentes, `<etapa_actual>`, sin avances cuando `canLogProgress` es false), de `parseCoachReply` (progress válido, recortado, vacío, ambos campos → solo etapas) y de lectura de propuestas viejas.
- La conversación del problema como caso de prueba del prompt (historial con la instrucción ya dada + "sí" → el prompt contiene la regla de no repetir y la última respuesta del coach en `<conversacion>`).
- typecheck, lint, tests, check:api, build; captura del chat con una propuesta de avance (mock de `/api/plan-meta`).
