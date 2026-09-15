# Auditoría B — "Hay mucha IA"

**Repo:** `/Users/dev/Documents/ProyectosPersonales/GESTORDEMETAS` · **Rama:** `feat/dieta-fase3`
**Fecha:** 2026-09-14 · **Método:** solo lectura de código (grep/sed). No se ejecutó la app, no se tocó git.

---

## 0. Hecho de partida, verificado

```
grep -rniE "openai|gemini|groq|anthropic|\bllm\b|gpt-4|api\.ai" src/  →  0 resultados
```

**No hay ninguna llamada a un LLM en `src/`.** Lo que el usuario percibe como "mucha IA" es una capa
determinista de contenido pre-escrito y reglas. El volumen de ese contenido:

| Fuente | Piezas | Archivo |
|---|---|---|
| Metas sugeridas (5 × 8 nichos) | **40** | `src/domain/recommendations.ts:15-72` |
| Hitos de plantilla (5 × 11) | **55** | `src/domain/templates.ts` |
| Acciones de sesión ("ideas de contenido") | **76** | `src/domain/templates.ts` |
| `kickoffActions` (5 × 11) — **nunca leídas** | **55** | `src/domain/templates.ts:44,90,133,178,224,271,314,359,405,449,481` |
| Keywords de `detectTemplate` | **606** | `src/domain/templates.ts` |
| Ideas de hábito | **10** | `src/screens/Habits.tsx:46-57` |
| Lecciones de Aprender (4 colecciones, 2 modos c/u) | **21** | `src/content/learn.ts` |
| CTAs que crean hábito/meta desde una lección | **14** | `src/content/learn.ts` |
| Preguntas de la mini-entrevista de nicho | **3** | `src/domain/niches.ts:42-78` |

**≈195 piezas de contenido vivas que la app propone al usuario** (+55 muertas). Eso —no un modelo—
es lo que produce la sensación de "la app tiene mucha opinión".

**Contexto histórico leído** (`AUDITORIA.md:826-1160`): se evaluaron 15 ideas de IA con LLM.
Veredictos: 7 "🟡 BAJAR PRIORIDAD", 8 "❌ DESCARTAR". El argumento repetido en 13 de 15 es
"una regla determinística lo resuelve igual o mejor". **Este informe no propone añadir IA real**;
propone lo contrario: reducir la voz determinista que ya existe.

---

## 1. Inventario de voz automática

Tipos: `SUG-META` sugerencia de meta · `SUG-HÁB` idea de hábito · `CONS-SES` consejo de sesión ·
`PISTA` hint de primera vez · `CELEB` celebración · `INTERP` interpretación de datos ·
`EDU` contenido educativo · `PLANT` plantilla/prellenado · `NUDGE` aviso que pide acción.

### A. Alta de una meta (Onboarding → Wizard → /ideas → GoalCreated)

| # | Pantalla | archivo:línea | Tipo | Qué decide por el usuario | Cuándo aparece | ¿Se cierra? | ¿Se repite? |
|---|---|---|---|---|---|---|---|
| A1 | Onboarding | `Onboarding.tsx:111-127` | EDU | 3 promesas de producto ("Progreso que no se inventa") | Paso 1, siempre | No (se pasa) | No |
| A2 | Onboarding | `Onboarding.tsx:154-159` | INTERP | "Según tus respuestas, tu foco sería **X**" | Tras la mini-entrevista | No (es un alert) | No |
| A3 | Onboarding | `Onboarding.tsx:182` + `191-200` + `niches.ts:42-99` | SUG-META | 3 preguntas → `scoreNiche()` elige el nicho | Opt-in explícito ("ayúdame a descubrirlo") | Sí, `onCancel` | No |
| A4 | Onboarding | `Onboarding.tsx:265` | PLANT | "Sugiere la hora de tus sesiones" → `preferredStartTime` (`commitment.ts:142-153`) | Paso 4, siempre | No | Reaparece en Wizard y Calendar |
| A5 | Wizard p.0 | `Wizard.tsx:330-337` | SUG-META | Link 💡 "Ver ideas de metas" al lado del input vacío | Siempre, paso 0 | No | Sí: Today.tsx:797, Goals.tsx:160, GoalDetail.tsx:728 |
| A6 | Wizard p.0→1 | `Wizard.tsx:210-219` + `templates.ts:512-526` | PLANT | `detectTemplate()` preselecciona **plantilla + área + orden de la lista** por conteo de keywords | Invisible, al pulsar Continuar | No (se puede cambiar en p.1) | No |
| A7 | Wizard p.1 | `Wizard.tsx:344` | PLANT | "Preseleccionamos el más parecido a tu meta" | Paso 1, siempre | No | No |
| A8 | Wizard p.1→2 | `Wizard.tsx:223-229` + `commitment.ts:231-241` | PLANT | **Escribe las 5 etapas de la meta** desde la plantilla | Invisible | No (editable) | No |
| A9 | Wizard p.3 | `Wizard.tsx:383` | PLANT | "El camino sugerido para tu tipo de meta" | Paso 3, siempre | No | No |
| A10 | Wizard p.2 | `CommitmentStep.tsx:402-412` + `commitment.ts:201-228` | NUDGE | `overcommitWarning`: "Los martes ya tienes 3 sesiones… **Revisa que el plan te entre**" | Si ≥3 sesiones o ≥90 min ese día | No | No |
| A11 | Wizard p.4 | `Wizard.tsx:411-413` | PISTA | Hint `wizard-why-2026-05` | 1 vez por dispositivo | Sí, × | No |
| A12 | /ideas | `GoalSuggestions.tsx:64-69` | SUG-META | "Ideas para ti" + "Sugerencias de {nicho}" | Al entrar | No (es la pantalla) | No |
| A13 | /ideas | `GoalSuggestions.tsx:35,72-85` + `recommendations.ts:74-76` | SUG-META | **5 metas concretas con título completo** listas para adoptar | Al entrar | No | No |
| A14 | /ideas → adopt | `GoalSuggestions.tsx:43-55` | PLANT | Al tocar una idea: siembra **título + plantilla + área + 5 etapas** en el wizard | Al adoptar | Editable en el wizard | No |
| A15 | GoalCreated | `GoalCreated.tsx:96-103` | PLANT | "Así la vas a lograr" + Roadmap de 5 etapas | Tras crear | No | Repite lo del Wizard p.3 |
| A16 | GoalCreated | `GoalCreated.tsx:119-130` | NUDGE | "Tu primera sesión · Mañana · 19:00" | Si hay compromiso | No | No |

### B. Hoy (`/`)

| # | archivo:línea | Tipo | Qué decide / afirma | Cuándo | ¿Se cierra? | ¿Se repite? |
|---|---|---|---|---|---|---|
| B1 | `Today.tsx:565-569` | CELEB | Chip 🔥 "{n} días" de racha | `streak >= 2` | No | Sí: `Progress.tsx:163-167`, `Profile.tsx:244-249`, anillo en `TopBar.tsx:65` y `SideNav.tsx` |
| B2 | `Today.tsx:574-582` | INTERP | Subtítulo que **juzga el día**: "Cumpliste tu compromiso de hoy." / "Hoy no pudiste — mañana se empieza de nuevo." | Si hay sesiones hoy | No | Sí — duplica `SessionCard.tsx:57` |
| B3 | `Today.tsx:386,388` + `635-639` + `useCheer.ts` | CELEB | Frase efímera: "Cumpliste tu compromiso de hoy. Bien hecho." / "Primera sesión del día. Así se empieza." | Al ✓ rápido | Se va sola (3.2 s) | Solapa con B2 |
| B4 | `Today.tsx:641-654` (+ lógica `256-275`) | INTERP | "Tu racha se reinició. Tu récord sigue siendo **N días**" | Racha rota ≤14 días | Sí, "Entendido" (localStorage) | No |
| B5 | `Today.tsx:656-671` | NUDGE | "Quedó una sesión abierta de **X**. ¿Cómo te fue?" | `toResolve` | No (navega) | Sí: `SessionCard.tsx:104` |
| B6 | `Today.tsx:672-687` + `dailyPlan.ts:78-86` | NUDGE | "**Revisión guiada** — N metas para revisar" | `goalsDueForReview` (≥7 días) | No | Sí: pantalla `/revision` entera |
| B7 | `Today.tsx:688-712` + `dailyPlan.ts:31-52` | NUDGE+INTERP | "Hace **N días** que no tocas **"X"**. ¿La retomamos o la pausamos **sin culpa**?" + 3 botones | `findForgottenGoal` (≥5 días sin avance) | "Está bien así" | No |
| B8 | `Today.tsx:558` | *(control)* | **Solo se muestra UN aviso** entre B5/B6/B7 (prioridad resolve > review > forgotten) | — | — | **Buena práctica ya existente** |
| B9 | `Today.tsx:718-721` | PISTA | Hint `session-partial-2026-06`: qué es una sesión parcial | 1 vez, si hay parcial | Sí, × | No |
| B10 | `Today.tsx:771-789` | NUDGE | "Hoy no comprometiste sesiones. Día libre — o súmale una sesión espontánea" | Sin sesiones, con metas | No | No |
| B11 | `Today.tsx:791-801` | SUG-META | "Cuando crees una meta, tu día se arma…" + "Ver ideas para empezar" | Sin metas activas | No | Sí: A5, Goals.tsx:156-160 |
| B12 | `Today.tsx:838` | SUG-HÁB | "＋ Sumar un hábito diario" | Sin hábitos | No | Sí: Habits.tsx:672 |
| B13 | `Today.tsx:856-874` + `dailyPlan.ts:94-96` | NUDGE | "Te quedaron N tareas pendientes de ayer" + Traer/Descartar | Hay `carryoverCandidates` | "Descartar" | No |
| B14 | `Today.tsx:736-762` (notePrompt, `Today.tsx:112`) | NUDGE | "¿Qué lograste? (opcional)" tras cada ✓ rápido | Cada ✓ rápido | "Omitir" | Sí: `SessionRun.tsx:452-461` |
| B15 | `SessionCard.tsx:38-46` | INTERP | "19:00–19:25 · **Tu plan: 2 de 4**" | Si la meta tiene eventos hoy | No | Sí: `SessionRun.tsx:673` (Disclosure "Plan · 2 de 4") |
| B16 | `SessionCard.tsx:57` | INTERP | "**Hoy no pudiste — está bien**" | Sesión `missed` | No | Duplica B2 |
| B17 | `SessionCard.tsx:104` | NUDGE | "Quedó sin confirmar — cuéntame cómo te fue" | Sesión `unconfirmed` | No | Duplica B5 |

### C. Sesión (`/sesion/:id`)

| # | archivo:línea | Tipo | Qué decide | Cuándo | ¿Se cierra? | ¿Se repite? |
|---|---|---|---|---|---|---|
| C1 | `SessionRun.tsx:263,493-498` + `sessions.ts:59-64` | CONS-SES | **La "idea de contenido"**: `pickSuggestion` rota el pool de 76 acciones por `(díaAbsoluto + hash(goalId)) % len`. La app decide *qué hacer* dentro de la sesión | Estado `pending`, siempre | **No** | No |
| C2 | `SessionRun.tsx:555` | INTERP | Cita del porqué del usuario | `pending`, si hay `why` | No | Sí: `574` (en pausa), `GoalDetail.tsx:461` |
| C3 | `SessionRun.tsx:115` | PISTA | Hint 💡 "Decir 'no pude' no rompe nada" — **dentro de `ResolutionOptions`, sin condición** | En los **3** usos: sesión abierta (`:503`), **"¡Lo lograste!" (`:534-535`)**, cierre anticipado (`:608`) | Sí, × (1 vez) | No |
| C4 | `SessionRun.tsx:452-461` | NUDGE | "¿Qué lograste en este tiempo? (opcional)" + hint "Queda en tu meta, para ver el camino recorrido" | Al cerrar done/partial | Botón "Guardar y volver" | Duplica B14 |
| C5 | `SessionRun.tsx:473-477` | NUDGE | "¿Completaste la etapa **"X"**?" | Al cerrar, si hay etapa abierta | "Aún no" | Sí: `Review.tsx:295`, `GoalDetail` checklist |
| C6 | `SessionRun.tsx:535` | CELEB | "¡Lo lograste!" + icono celebración | Objetivo alcanzado | No | Sí: `Review.tsx:277`, `GoalDetail.tsx:706` |
| C7 | `SessionRun.tsx:672-676` | INTERP | Disclosure "Plan · 2 de 4" | Si hay eventos | Plegado por defecto si corre | Duplica B15 |

### D. Hábitos (`/habitos`)

| # | archivo:línea | Tipo | Qué decide | Cuándo | ¿Se cierra? | ¿Se repite? |
|---|---|---|---|---|---|---|
| D1 | `Habits.tsx:46-57` + `381-394` + `668-677` | SUG-HÁB | "💡 **Ideas populares**": 10 chips que prellenan el formulario | Si `active.length === 0` | No (es el vacío) | No |
| D2 | `Habits.tsx:678-680` | SUG-HÁB | `Disclosure "Ideas para sumar"` — **mismos 10 chips, plegados** | Si ya hay hábitos | Sí (details) | Mismo contenido que D1 |
| D3 | `Habits.tsx:528` | SUG-HÁB | "Crea el primero o toca una idea popular para empezar." | Vacío | No | Refuerza D1 |
| D4 | `Habits.tsx:209-218` | PLANT | Deep-link `?nuevo=TÍTULO&area=` prellena el formulario desde Aprender | Desde CTA de lección | No | — |

### E. Crecer: Progreso (`/progreso`) y Aprender (`/aprender`)

| # | archivo:línea | Tipo | Qué decide / afirma | Cuándo | ¿Se cierra? | ¿Se repite? |
|---|---|---|---|---|---|---|
| E1 | `Progress.tsx:144` | INTERP | "Cómo vas avanzando" | Siempre | No | — |
| E2 | `Progress.tsx:163-167` | CELEB | Chip racha + "récord N" | `streak>=2` | No | Duplica B1 |
| E3 | `Progress.tsx:388-389` | EDU | "Tu camino empieza hoy. Cada etapa que cumplas y cada meta que logres queda aquí." | Timeline vacío | No | — |
| E4 | `Learn.tsx` (pantalla completa) + `content/learn.ts` | EDU | **21 lecciones × 2 modos** (resumen ~80 palabras / a fondo 250-350) de crecimiento personal. Es una app de contenido dentro de la app de metas | Pestaña "Crecer" | No | — |
| E5 | `Learn.tsx:250-261` | CONS-SES | "💡 **Aplícalo hoy**" — tarea concreta por lección | Cada lección | No | Compite con C1 y con las acciones de plantilla |
| E6 | `Learn.tsx:279-289` + `content/learn.ts` (14 CTAs) | SUG-HÁB/META | "**Crear el hábito: 'Leer una página antes de dormir'**" → crea contenido real | 14 de 21 lecciones | No | Compite con D1 |
| E7 | `Learn.tsx:396-400` + `443` | INTERP | Reordena colecciones por el área de tu meta ⭐ y marca "**Para tu foco**" | Siempre | No | — |
| E8 | `Learn.tsx:457-460`, `375` | NUDGE | "Sigue: {lección} →" / "· sigue aquí" | Con progreso parcial | No | — |
| E9 | `Learn.tsx:350-352` | CELEB | "Colección completa. **Releer también cuenta.**" | Colección al 100% | No | — |

### F. Revisión (`/revision`) y Detalle de meta

| # | archivo:línea | Tipo | Qué decide / afirma | Cuándo | ¿Se cierra? | ¿Se repite? |
|---|---|---|---|---|---|---|
| F1 | `Review.tsx:227-246` | INTERP | "ETAPA 3 DE 5" + etapa actual → siguiente + "N sesiones cumplidas esta semana" / "Sin sesiones esta semana" | Por cada meta | No | Sí: `Progress.tsx:296-300`, `GoalDetail.tsx:462-470` |
| F2 | `Review.tsx:141-147` | INTERP+CELEB | "Revisión lista / **Lo dejaste para después**" + "Repasaste N de M. **Así se mantiene el rumbo.**" | Al terminar | No | — |
| F3 | `Review.tsx:127-130` | *(control)* | **No celebra si saltaste todo** (`reviewedAny`) — "confeti inmerecido" evitado | — | — | **Buena práctica ya existente** |
| F4 | `GoalDetail.tsx:554-568` | NUDGE+CELEB | "🎉 **Recorriste todo el camino**. Cumpliste todas las etapas. ¿La damos por lograda?" | Todas las etapas ✓ | "Todavía no" | Sí: `Review.tsx:281` |
| F5 | `GoalDetail.tsx:679-682` | INTERP | "Te quedan N etapas sin marcar." + "Ya las cumplí — márcalas y lógrala" | Al lograr con etapas abiertas | "Cancelar" | — |
| F6 | `GoalDetail.tsx:705-729` | CELEB+SUG-META | "🎉 ¡Meta lograda! **¿Vas por la próxima? Te paso ideas para seguir avanzando.**" | Meta `done` | No | Sí: A5/A12 |

### G. Global / fuera de pantalla

| # | archivo:línea | Tipo | Qué decide | ¿Se cierra? |
|---|---|---|---|---|
| G1 | `Profile.tsx:242-291` + `domain/frames.ts:23-28` | CELEB | **Gamificación**: marcos Bronce/Plata/Oro/**Leyenda** por racha; el anillo rodea el avatar en toda la app | No (`Disclosure` solo para la explicación) |
| G2 | `TopBar.tsx:62-66`, `SideNav.tsx:52-60` | CELEB | Anillo de marco en el avatar, siempre visible | No |
| G3 | `app/toast.tsx:29-37` | CELEB | Toasts: "¡Meta lograda! Bien hecho." (`GoalDetail.tsx:202`), "¡Meta lograda! Recorriste todo el camino." (`Review.tsx:277`), "Pausada. La retomas cuando quieras." | Se van solos (3.2 s) |
| G4 | `supabase/functions/send-reminders/index.ts:98-99` | NUDGE | Push: "Tu sesión de {meta}" / "**25 min — es tu momento. Un toque y empezamos.**" | Interruptor en `Profile.tsx:291+` |
| G5 | `Goals.tsx:154-163` | SUG-META | "Mira ideas para tu foco y adopta una" + "Ver ideas para empezar" | No |
| G6 | `Auth.tsx:171` | EDU | "…constancia sin culpa." (copy de marca en login) | No |

### H. Código muerto de la capa de "inteligencia"

| # | archivo:línea | Hallazgo |
|---|---|---|
| H1 | `templates.ts:44,90,133,178,224,271,314,359,405,449,481` + `lib/types.ts:113` | **`kickoffActions`: 55 frases escritas y mantenidas que NADIE lee.** `grep -rn kickoffActions src/` fuera de su definición → 0 resultados. Es el resto del ítem #4 de `AUDITORIA.md` (acción de arranque por plantilla) que nunca se cableó. |
| H2 | `components/icons.tsx:100-112` | **`IconSparkles` no se usa en ninguna parte.** El ícono de "magia IA" existe y está muerto — señal de que el rumbo de producto se corrigió pero no se limpió. |
| H3 | `templates.ts:51,97,140,185,231,278,321,366,412,456,488` (`cadence`) | Solo lo usa `services/backfill.ts:54` (migración de metas legacy). No afecta a metas nuevas. Es deuda, no voz. |

---

## 2. Juicio por punto

Criterios: **¿se lo gana?** (¿responde una duda real en ese momento?) · **¿es honesto?** (no vende
inteligencia inexistente) · **¿compite con el contenido principal?**

### Veredicto QUITAR (9)

| # | Veredicto | Por qué | Sev. | Costo |
|---|---|---|---|---|
| **C3** Hint "no pude" en `ResolutionOptions` | **QUITAR de dos de los tres usos** | No se lo gana: en `SessionRun.tsx:535` la app dice "**¡Lo lograste!**" y tres píxeles abajo consuela "decir 'no pude' no rompe nada". Consolar a quien acaba de ganar es el caso más puro de "la app habla sin mirar". | **P0** | S |
| **H1** `kickoffActions` | **QUITAR** (55 strings + campo de `types.ts:113`) | Contenido mantenido que ningún usuario ve jamás. Cuesta revisión en cada cambio de plantilla y engaña al que lee el código creyendo que hay lógica de arranque. | P2 | S |
| **H2** `IconSparkles` | **QUITAR** | Ícono de "IA mágica" muerto. Su sola presencia invita a reintroducir voz mágica. | P3 | S |
| **B16** "Hoy no pudiste — está bien" | **QUITAR el juicio, dejar el dato** | Duplica literalmente B2 en la misma pantalla. Dos consuelos por un mismo fallo se leen como insistencia. La tarjeta debe decir el **hecho** ("Sin cumplir"); el marco emocional, si va, va una sola vez. | P1 | S |
| **E5** "Aplícalo hoy" como bloque destacado | **QUITAR el destaque** (fundir en el cuerpo) | El kicker 💡 + tarjeta convierten un párrafo en una tercera tarea del día, compitiendo con C1 (idea de sesión) y D1 (ideas de hábito). Las tres voces dicen "haz esto hoy" desde sitios distintos. | P2 | S |
| **B12** "＋ Sumar un hábito diario" en Hoy | **QUITAR** | Hoy ya tiene el aviso B10, el B11 y el B13. Hábitos es una pestaña del BottomNav (`BottomNav.tsx:16`): el acceso está garantizado; el nudge solo suma una voz. | P2 | S |
| **D3** "Crea el primero o toca una idea popular" | **QUITAR** | Los chips D1 están inmediatamente debajo y se explican solos. Es un narrador describiendo lo que ya se ve. | P3 | S |
| **E9** "Releer también cuenta." | **QUITAR** | Frase de coach, no de app. No resuelve ninguna duda. | P3 | S |
| **G6** "constancia sin culpa" en Auth | **QUITAR o mover a marketing** | Promesa terapéutica antes de que el usuario tenga cuenta. Compite con el formulario. | P3 | S |

### Veredicto PLEGAR (13)

| # | Veredicto | Por qué | Sev. | Costo |
|---|---|---|---|---|
| **C1** Idea de contenido de la sesión | **PLEGAR en Disclosure** + honestidad de copy | Se lo gana a veces (primeras sesiones de una meta), pero es la voz que más "sabe" sin saber: `pickSuggestion` es `(día + hash(id)) % 76` (`sessions.ts:59-64`) — **ignora la etapa actual, el título, el porqué y el criterio de éxito**. Un usuario en la etapa 5 recibe la misma acción que uno en la 1. Ese desajuste es exactamente lo que se siente como "IA mala". Plegarla bajo el plan (`SessionRun.tsx:672`) con un summary tipo "¿Ideas para llenar la sesión?" la vuelve opt-in. | **P0** | M |
| **B1/E2/G1/G2** Racha + marcos | **PLEGAR a una sola superficie** | La misma métrica grita en 4 sitios: chip en Hoy, chip+récord en Progreso, sección "Tu marco" en Perfil, y anillo permanente en TopBar y SideNav. Cuatro recordatorios de la misma cifra. Además "**Leyenda** a 50 días" (`frames.ts:27`) es el punto más gamificado de la app y choca de frente con "la app guía, no exige". | P1 | M |
| **B3** `useCheer` | **PLEGAR: dejar 1 de los 2** | "Cumpliste tu compromiso de hoy. Bien hecho." (`:386`) y el subtítulo B2 "Cumpliste tu compromiso de hoy." (`:577`) son **el mismo texto** apareciendo dos veces en la misma vista al mismo tiempo. | P1 | S |
| **B2** Subtítulo interpretativo de Hoy | **PLEGAR al dato** | "3 de 4 sesiones" se lo gana. "Hoy no pudiste — mañana se empieza de nuevo" es interpretación emocional en un `h1`+`subtitle`, el lugar de más peso visual. Dejar el conteo; el consuelo vive en un sitio y no en tres. | P1 | S |
| **B14 + C4** "¿Qué lograste?" | **PLEGAR a uno** | La misma pregunta aparece tras el ✓ rápido en Hoy (`Today.tsx:112, 736-762`) y tras el cierre en la sesión (`SessionRun.tsx:452-461`). Que el diario exista está bien; que la app lo pida dos veces por la misma sesión, no. | P2 | S |
| **B15 + C7** "Tu plan: X de Y" | **PLEGAR: mantener solo en la sesión** | Duplicado exacto entre tarjeta y pantalla de sesión. En la tarjeta compite con el rango horario y el objetivo (tres datos donde el propio comentario del código dice "dos datos como máximo", `SessionCard.tsx:33-37`). | P3 | S |
| **B5 + B17** "sin confirmar" | **PLEGAR: uno de los dos** | El aviso de Hoy (`:656`) y el meta de la tarjeta (`SessionCard.tsx:104`) dicen lo mismo en la misma pantalla cuando la sesión sin confirmar es de hoy. | P2 | S |
| **E4/E6** Aprender (21 lecciones + 14 CTAs) | **PLEGAR bajo su propia entrada, fuera de "Crecer"** | La calidad del contenido es alta y es opt-in (hay que entrar). Pero comparte pestaña con Progreso vía un `seg` (`Progress.tsx:148-156`, `Learn.tsx:408-416`), lo que hace que "mirar cómo voy" y "leer un ensayo de 350 palabras" sean el mismo gesto. Los 14 CTAs además **crean contenido real** (hábitos, metas) desde una lección, multiplicando las fuentes de creación. | P2 | M |
| **E7** "Para tu foco" | **PLEGAR: quitar el tag, dejar el orden** | El reordenamiento es útil y silencioso. La etiqueta convierte una ayuda invisible en una afirmación sobre el usuario. | P3 | S |
| **E8** "Sigue: X →" / "· sigue aquí" | **PLEGAR a uno** | Se repite en la tarjeta de colección (`:458`) y en la fila de lección (`:375`) dentro del mismo recorrido. | P3 | S |
| **A5/B11/G5/F6** "Ver ideas…" | **PLEGAR a 2 puntos de entrada** | El mismo enlace en 4 sitios: Wizard p.0 (`:336`), Hoy vacío (`:797`), Metas vacío (`Goals.tsx:160`), meta lograda (`GoalDetail.tsx:728`). Los dos vacíos se lo ganan; dentro del wizard compite con el input que acabas de pedirle que rellene. | P2 | S |
| **D1 + D2** Ideas de hábito | **MANTENER como está** (ya plegado correctamente) | `Habits.tsx:668-680` ya hace exactamente lo correcto: visible en el vacío, dentro de un `Disclosure` cuando ya hay hábitos. **Es el patrón a replicar en el resto de la app.** | — | — |
| **A10** `overcommitWarning` | **PLEGAR el imperativo** | El dato ("Los martes ya tienes 3 sesiones (90 min) de otras metas") se lo gana con creces. "**Revisa que el plan te entre**" (`commitment.ts:227`) es la app dándote una orden — el único imperativo directo del flujo. | P2 | S |

### Veredicto MANTENER (18)

| # | Por qué se lo gana |
|---|---|
| **B8** `Today.tsx:558` — un solo aviso a la vez | **Es la mejor decisión de diseño del repo.** Debe extenderse, no revertirse. |
| **F3** `Review.tsx:127-130` — no celebrar si saltaste todo | Honestidad explícita. Modelo a seguir. |
| **B7** meta olvidada | Responde una duda real ("¿qué hago con esto que abandoné?") y ofrece **salida sin culpa** ("Está bien así", `:706`). Es "guía, no exige" bien ejecutado. Ajuste menor: "¿La retomamos…?" usa la 1ª persona del plural donde el resto de la app tutea. |
| **B4** racha rota | Explica una desaparición que sin texto sería un bug percibido (el comentario del código lo dice: "el silencio es peor", `:256-258`). Se cierra y se persiste. |
| **B13** tareas de ayer | Dato propio del usuario, dos acciones claras, se descarta. |
| **B6** revisión guiada | Determinista, honesto, una línea, navega. |
| **B9, A11** los 2 Hints restantes | **Solo hay 3 `<Hint>` en toda la app** — disciplina real. Los dos que quedan explican mecánica no obvia (qué es una parcial; dónde reaparece tu porqué). |
| **A3** mini-entrevista de nicho | 100% opt-in tras un botón explícito, cancelable, 3 preguntas. |
| **A6/A8/A14** `detectTemplate` + siembra de etapas | El valor central del producto: no empezar desde una página en blanco. Todo es editable (`milestonesTouched` en `Wizard.tsx:141,225` nunca pisa lo que tocaste). Ver salvedad de honestidad más abajo. |
| **A13** 40 metas sugeridas | Pantalla dedicada, se entra a propósito, "Escribir mi propia meta" siempre presente (`GoalSuggestions.tsx:87-93`). |
| **A15/A16** GoalCreated | Momento de pago tras el esfuerzo del wizard. |
| **C2** cita del porqué | Es **texto del usuario**, no de la app. Además ya está bien dosificado: en `pending` sí, corriendo no, en pausa sí (`SessionRun.tsx:573-576`). |
| **C5/F4/F5** preguntas de etapa | Preguntan, no afirman; siempre hay "Aún no" / "Todavía no". |
| **F1** contexto de revisión | Dato calculado, no interpretación. |
| **A2** "tu foco sería X" | Devuelve el resultado de algo que el usuario pidió, y dice "Puedes cambiarlo abajo". |
| **G3** toasts | `toast.tsx:29-37` documenta una política de tono explícita y la respeta (máximo 1 visible). |
| **G4** push | Opt-in real, un interruptor en Perfil, llega solo a la hora que tú fijaste. |
| **Agenda (`Calendar.tsx`, 1690 líneas)** | **Cero voz sugerente.** El grep de sugerencias/ideas/consejos da 0 resultados en toda la pantalla. La única "sugerencia" es `suggested` (`Calendar.tsx:1341`), una hora prellenada en un `<input type="time">` editable. **Es la prueba de que la app sabe callar cuando quiere.** |

### Salvedad de honestidad (aplica a A6/A7/A8/A9/A12)

Ningún copy vende IA que no existe — no hay "inteligente", "personalizado con IA", "automágico"
en ninguna cadena. Pero hay dos afirmaciones **infladas** respecto de lo que el código hace:

- `Wizard.tsx:344`: "Preseleccionamos **el más parecido a tu meta**". Lo real es un conteo de
  substrings (`templates.ts:512-526`). El propio `AUDITORIA.md` documenta el fallo: *"'bajar' y
  'comer' viven en salud_fisico, así que 'bajar mis deudas' se iría a salud"*. Con 606 keywords y
  `text.includes(kw)` sin límites de palabra, "**bici**cleta" matchea dentro de otras cadenas.
  Copy honesto: "Elegimos un tipo por las palabras de tu meta. Cámbialo si no encaja."
- `Wizard.tsx:383` / `GoalSuggestions.tsx:67`: "El camino **sugerido para tu tipo de meta**" /
  "cada una con sus **etapas sugeridas**". Son 5 hitos fijos idénticos para todas las metas de esa
  plantilla. Decir "**El camino típico de este tipo de meta**" no promete personalización.

---

## 3. Densidad

### 3.1 Día típico: Hoy → sesión → agenda

**Escenario A — día normal** (2 metas, 1 sesión hoy, 1 hábito, racha de 5 días):

| Voz | Origen |
|---|---|
| 1 | Chip 🔥 "5 días" (`Today.tsx:565`) |
| 2 | "0 de 1 sesión" (`Today.tsx:574`) |
| 3 | Anillo de marco Plata en el avatar (`TopBar.tsx:65`) |
| 4 | Hint de sesión parcial, si aplica (`Today.tsx:718`) |
| 5 | "19:00–19:25 · Tu plan: 0 de 3" (`SessionCard.tsx:44`) |
| 6 | "Sumar un hábito diario" si no hay hábitos (`Today.tsx:838`) |

→ **entra en sesión** →

| 7 | 💡 Idea de contenido (`SessionRun.tsx:496`) |
| 8 | Cita del porqué (`SessionRun.tsx:555`) |
| 9 | Disclosure "Plan · 0 de 3" (`SessionRun.tsx:672`) — repite la #5 |

→ **cierra la sesión** →

| 10 | "¡Lo lograste!" (`SessionRun.tsx:535`) |
| 11 | Hint "no pude" **bajo la celebración** (`SessionRun.tsx:115`) ← **contradicción** |
| 12 | "¿Qué lograste en este tiempo?" + hint (`SessionRun.tsx:452-461`) |
| 13 | "¿Completaste la etapa 'X'?" (`SessionRun.tsx:473`) |

→ **vuelve a Hoy** →

| 14 | Cheer "Cumpliste tu compromiso de hoy. Bien hecho." (`Today.tsx:386`) |
| 15 | Subtítulo "Cumpliste tu compromiso de hoy." (`Today.tsx:577`) ← **texto idéntico a la #14, simultáneo** |
| 16 | Toast, si cerró desde Review/GoalDetail (`toast.tsx`) |

→ **entra en Agenda** →

| — | **0 voces.** |

**≈16 voces en un día normal, 0 de ellas en la Agenda.**

**Escenario B — peor caso en una sola vista de Hoy** (racha recién rota + sesión sin confirmar de
ayer + tareas pendientes de ayer + sesión parcial hoy + acaba de marcar un ✓):

```
Today.tsx:635  cheer efímero
Today.tsx:641  "Tu racha se reinició. Tu récord sigue siendo 12 días…"   [enter(2)]
Today.tsx:656  "Quedó una sesión abierta de X. ¿Cómo te fue?"            [enter(2)]  ← MISMO SLOT
Today.tsx:718  Hint 💡 "Una sesión parcial cuenta lo que hiciste…"
Today.tsx:856  "Te quedaron 3 tareas pendientes de ayer:"  [Traer][Descartar]
Today.tsx:574  subtítulo interpretativo
Today.tsx:565  chip de racha (o su ausencia súbita)
```

→ **7 voces apiladas**, 3 de ellas con botones que piden decidir algo. El presupuesto de
`Today.tsx:558` **solo desduplica B5/B6/B7 entre sí**: no cubre `streakBroken` (`:641`), ni el
`Hint` (`:718`), ni el carryover (`:856`), ni el `cheer` (`:635`). Es el punto de mayor densidad
de toda la app y el más probable origen de "hay mucha IA".

### 3.2 Alta de una meta: Onboarding → Wizard → /ideas → GoalCreated

| Etapa | Voces | Detalle |
|---|---|---|
| Onboarding paso 1 | 4 | Título + subtítulo + 3 tarjetas de promesa |
| Onboarding paso 2 | 2-6 | 8 nichos con blurb + botón "ayúdame a descubrirlo"; con entrevista: +3 preguntas +1 "tu foco sería X" |
| Onboarding paso 3-4 | 4 | 2 hints + "Sugiere la hora de tus sesiones" + 4 opciones |
| /ideas (opcional) | 7 | Título + subtítulo + 5 metas completas |
| Wizard p.0 | 3 | Título + hint con 2 ejemplos + link 💡 "Ver ideas de metas" |
| Wizard p.1 | 2 + **invisible** | Hint + 11 descripciones de plantilla; **detectTemplate ya eligió plantilla y área** sin decirlo |
| Wizard p.2 | 3-4 | Hint + resumen del compromiso + `overcommitWarning` + "Las horas son opcionales…" |
| Wizard p.3 | 2 + **5 etapas escritas por la app** | "Estas son tus etapas" + "El camino sugerido…" + texto de 5 hitos |
| Wizard p.4 | 2 | Hint del paso + `<Hint>` del porqué |
| Wizard p.5 | 2 | Hint + resumen |
| GoalCreated | 5 | "¡Meta creada!" + "Así la vas a lograr" + 5 hitos (repetidos) + "Tu compromiso" + "Tu primera sesión" |

**≈32-38 voces para crear una meta**, de las cuales **~9 son contenido que la app escribió por el
usuario** (título si adoptó una idea, plantilla, área, 5 hitos, hora, cadencia).

**Apilamientos de 2+ sugerencias en la misma vista:**

1. `Today.tsx:641` + `:656/:672/:688` — aviso de racha y aviso contextual comparten `enter(2)` y se
   renderizan uno tras otro. **El único apilamiento estructural.**
2. `Today.tsx:635` (cheer) + `:574` (subtítulo) — **mismo texto exacto, simultáneo**.
3. `SessionRun.tsx:535` ("¡Lo lograste!") + `:115` (hint "no pude") — **contradictorios**.
4. `SessionRun.tsx:496` (idea) + `:555` (porqué) — dos textos consecutivos antes del botón "Comenzar".
5. `Today.tsx:574` + `SessionCard.tsx:57` — "Hoy no pudiste" dos veces en la misma pantalla.
6. `Wizard.tsx:313` (hint del paso) + `:336` (link a ideas) — dos invitaciones sobre un input vacío.
7. `Habits.tsx:528` + `:668-677` — narrador + chips que se explican solos.

---

## 4. Regla de voz propuesta

> **1.** La app habla cuando el usuario **no puede saber algo mirando la pantalla**: mecánica no
> obvia (qué es una parcial), un cambio que ella provocó (la racha desapareció), o un dato propio
> del usuario que está fuera de vista (3 tareas de ayer). Nunca para narrar lo que ya se ve.
>
> **2.** **Una voz por vista.** El presupuesto de `Today.tsx:558` se extiende a *todos* los avisos
> de una pantalla —hints, cheers, carryover y notices compiten por el mismo slot único— y el orden
> de prioridad es: consecuencia de una acción del usuario > pregunta que la app necesita > sugerencia.
>
> **3.** Sugerir es **ofrecer, no proponer**: toda idea de meta, hábito o contenido vive detrás de
> un gesto (una pestaña, un `Disclosure`, un estado vacío). Nunca aparece sola en el flujo de quien
> ya sabe qué hacer. El patrón canónico ya existe: `Habits.tsx:668-680`.
>
> **4.** **Datos sí, veredictos no.** "0 de 3 sesiones", "hace 7 días sin avance", "etapa 3 de 5" se
> ganan siempre. "Hoy no pudiste", "Así se mantiene el rumbo", "Bien hecho" se ganan como máximo
> **una vez por evento** y jamás en dos superficies a la vez.
>
> **5.** **El copy dice lo que el código hace.** Si son 5 hitos fijos por plantilla, se llaman "el
> camino típico", no "el camino sugerido para tu meta". Prometer menos de lo que se entrega es la
> versión de "guía, no exige" aplicada al lenguaje.

---

## 5. Top 8 acciones (impacto / costo)

| # | Acción | archivo:línea | Cambio concreto | Sev. | Costo |
|---|---|---|---|---|---|
| **1** | **Quitar el hint "no pude" de la celebración** | `SessionRun.tsx:115` (usados en `:503`, `:534`, `:608`) | Añadir prop `showMissedHint?: boolean` a `ResolutionOptions` y pasarla **solo** desde `:503` (sesión abierta) y `:608` (cierre anticipado). En `:534` (el que lleva `title="¡Lo lograste!"`, `:535`) no renderizar el `<Hint>`. Consolar a quien acaba de cumplir es el bug de tono más visible de la app. | **P0** | **S** |
| **2** | **Presupuesto único de voz en Hoy** | `Today.tsx:558` → aplicar a `:635`, `:641`, `:656`, `:672`, `:688`, `:718`, `:856` | Extender la constante `notice` a un *slot* único: `const voice = cheerMessage ? 'cheer' : streakBroken&&!dismissed ? 'streak' : toResolve ? 'resolve' : reviewDue.length ? 'review' : forgotten ? 'forgotten' : yesterdayPending.length ? 'carryover' : null`. Renderizar exactamente uno. Pasa el peor caso de **7 voces a 1-2**. | **P0** | **M** |
| **3** | **Eliminar el eco cheer ↔ subtítulo** | `Today.tsx:386` vs `:577` | Son la misma frase mostrada dos veces a la vez. Borrar `cheer('Cumpliste tu compromiso de hoy. Bien hecho.')` de `:386` y dejar que lo diga el subtítulo, que persiste; conservar solo el cheer de `:388` ("Primera sesión del día"), que sí aporta algo que el subtítulo no dice. | P1 | **S** |
| **4** | **Plegar la idea de contenido de la sesión** | `SessionRun.tsx:263, 493-498` | Mover el chip 💡 dentro del `Disclosure` de `:672`, con summary "Ideas para llenar la sesión". Alternativa mínima si se quiere conservar visible: mostrarlo **solo** cuando la meta no tiene aún ningún evento en el plan (`planItems.length === 0`) — ahí sí responde una duda real. | **P0** | **M** |
| **5** | **Honestidad del copy de plantillas** | `Wizard.tsx:344`, `Wizard.tsx:383`, `GoalSuggestions.tsx:67-68` | `:344` → "Elegimos un tipo por las palabras de tu meta. Cámbialo si no encaja." · `:383` → "El camino **típico** de este tipo de meta, en orden. Edítalo a tu gusto." · `:67-68` → "etapas **típicas**" en vez de "etapas sugeridas". Deja de prometer una personalización que `detectTemplate` (`templates.ts:512-526`, conteo de substrings) no hace. | P1 | **S** |
| **6** | **Borrar el código muerto de la capa "IA"** | `templates.ts:44,90,133,178,224,271,314,359,405,449,481` + `lib/types.ts:113` + `icons.tsx:100-112` | Eliminar los 11 bloques `kickoffActions` (**55 frases que nadie lee**), el campo opcional de `GoalTemplate`, y `IconSparkles` (0 usos). ~70 líneas menos de contenido que mantener y una señal clara de rumbo. | P2 | **S** |
| **7** | **Un solo "Hoy no pudiste" y un solo "Tu plan"** | `Today.tsx:577-579` + `SessionCard.tsx:57`; `SessionCard.tsx:44` + `SessionRun.tsx:672` | En `SessionCard.tsx:57` cambiar `'Hoy no pudiste — está bien'` por `'Sin cumplir'` (dato, no veredicto); el marco emocional lo da el subtítulo de Hoy, una vez. En `SessionCard.tsx:44` quitar `Tu plan: X de Y` — ya vive en el `Disclosure` de la sesión, y el propio comentario de `SessionCard.tsx:33-37` pide "dos datos como máximo". | P1 | **S** |
| **8** | **Rebajar la gamificación a una superficie** | `Profile.tsx:242-291`, `TopBar.tsx:62-66`, `SideNav.tsx:52-60`, `Today.tsx:565`, `Progress.tsx:163`, `frames.ts:23-28` | La misma racha aparece en 5 sitios. Dejar el chip en **Progreso** (donde se va a mirar números) y el detalle en Perfil; quitar el chip de `Today.tsx:565` y el anillo permanente de TopBar/SideNav. Revisar el nombre del marco "**Leyenda**" (`frames.ts:27`): el vocabulario de logro de videojuego es lo más lejos que llega la app de "guía, no exige". | P1 | **M** |

---

## 6. Resumen de veredictos

| Veredicto | Puntos |
|---|---|
| **MANTENER** | **18** |
| **PLEGAR** (Disclosure / menú / slot único / un solo sitio) | **13** |
| **QUITAR** | **9** |
| **Total de puntos de voz inventariados** | **40** (+3 hallazgos de código muerto) |

**Observación final.** La app no tiene un problema de *cantidad* de mecanismos —casi todos son
defendibles uno a uno— sino de **falta de presupuesto compartido**: cada pantalla decide sola si
habla, y `Today.tsx:558` es el único sitio donde alguien contó. La prueba de que el equipo sabe
hacerlo está en el propio repo: `Calendar.tsx` (1690 líneas) no sugiere nada, `Habits.tsx:668-680`
pliega sus ideas cuando ya no hacen falta, `Review.tsx:127-130` se niega a celebrar lo que no
ocurrió, y en toda la app hay **solo 3 `<Hint>`**. Aplicar esa misma disciplina a Hoy y a la
pantalla de sesión resuelve la percepción de "mucha IA" sin tocar una sola línea de contenido.
