# Coach del paso "Arma tu camino": camino completo y dentro de la meta

Fecha: 2026-11-09. Pedido del usuario tras crear la meta "conseguir gafas":

> "faltan etapas, debe ser el camino completo" · "la meta debe estar limitada a las
> gafas" · "haz todo el plan hasta que la compro"

Resultado: tres etapas sueltas (revisión y ergonomía, pausas activas, lentes con
filtro), ninguna quitada al pedirlo y un consejo de ejecución en vez del plan.

## 1. Causas

1. **El texto escrito no responde la pregunta abierta.** Con una pregunta pendiente,
   la caja dice "O cuéntale con tus palabras…", pero `CoachPanel.sendChat` lo manda al
   chat. La pregunta queda sin responder y el plan completo nunca se genera.
2. **Sin regla de alcance.** El prompt invita a agregar "algo que suele frenar este
   tipo de meta" y a anticipar obstáculos; nada dice que las etapas deben quedarse en
   el resultado de la meta. El contexto de la persona se convierte en metas vecinas.
3. **Solo quita lo que "ya tenía de antes".** "Limítala a X" no encaja en ninguna regla.
4. **El asistente usa el prompt de una meta en curso.** "Nombra la etapa actual y di
   por qué el paso la acerca" produce consejos de ejecución mientras la persona todavía
   está diseñando. Además, una propuesta admite 4 cambios: un camino entero no cabe.
5. **Dice "agregué" cuando solo propone.** El chat no pasa por `honestReply`.

## 2. Cambios

### 2.1 La pregunta abierta se responde escribiendo
En `CoachPanel`, si hay una pregunta pendiente, el texto enviado es su respuesta
(igual que tocar una opción). Sin pregunta pendiente, va al chat como hoy.

### 2.2 Modo "diseñando" en el chat
`ChatContext.designing` (lo manda el asistente de nueva meta). En ese modo el prompt
no usa las reglas de avance (etapa actual, registrar avances) y pide lo contrario: no
dar consejos de ejecución; dejar las etapas completas y dentro de la meta.

### 2.3 Camino completo en una propuesta
La respuesta suma `path`: la lista ordenada de títulos del camino completo, desde el
primer paso hasta el resultado de la meta. La IA lo llena cuando la persona pide el
plan o el camino completo, dice que faltan etapas o todavía no hay ninguna.
- El servidor lo valida (3 a 8 títulos, sin repetidos) y lo convierte en cambios
  (`remove` de lo que no sigue, `add` encadenado de lo nuevo); las etapas cumplidas
  nunca se quitan. La propuesta guarda además `path` para mostrarlo.
- La tarjeta muestra el camino numerado y un solo "Aplicar".
- Solo en modo "diseñando". En una meta en curso se usan cambios (tope 4 → 8).

### 2.4 Alcance y "eso sobra"
- Instrucción fija del coach (vale para preguntas, plan, pulir, chat y criterio):
  **camino completo** (quien cumpla solo las etapas tiene la meta lograda; la última
  etapa es lograrla) y **alcance** (lo que la persona cuenta de sí concreta las
  etapas; no agrega otras metas ni hábitos que no pidió).
- Chat: si la persona dice que algo sobra o pide limitar la meta, se proponen los
  `remove` de todas las etapas que se salen.

### 2.4.1 Plan inicial más completo
El plan inicial pide de 4 a 7 etapas (antes 3 a 6; el validador sigue aceptando 3),
títulos que empiezan con verbo en infinitivo y primeras acciones que dicen qué
hacer, con qué o dónde, y qué queda hecho.

### 2.5 Nunca afirmar lo que solo se propone
`honestReply` pasa a un módulo propio y también filtra la respuesta del chat. Suma
los verbos del chat (quité, cambié, registré…).

### 2.6 Caché
El caché implícito de Gemini exige un prefijo estable de 2.048–4.096 tokens según el
modelo; los prompts del coach son de cientos. No aplica hoy y no se infla el prompt
para alcanzarlo. Las reglas nuevas van en la instrucción fija (el prefijo), que es lo
que el caché aprovecharía si el prompt crece.

## 3. Fuera de alcance
- Cambiar las guías por área.
- Caché de respuestas en la app (el plan y las respuestas ya se guardan en el borrador).

## 4. Pruebas
- `coachChat.test.ts`: modo diseñando (sin reglas de avance), `path` → cambios, no
  quita cumplidas, `path` ignorado fuera del asistente, tope de cambios, respuesta
  honesta.
- `honestReply.test.ts`, `planMeta.test.ts` (`designing` viaja).
- e2e: escribir con una pregunta abierta la responde; la tarjeta muestra el camino.
- Evaluación con el modelo real (script local, fuera de CI): la conversación de las
  gafas, 5 corridas. Criterio: ninguna etapa fuera de la meta; al pedir limitar, se
  proponen los `remove`; al pedir el plan, llega un `path` que termina en tener las gafas.
