# Auditoría A — Información repetida ENTRE pantallas

**Producto:** Lógralo (GESTORDEMETAS) · **Rama:** `feat/dieta-fase3` · **Fecha:** 2026-09-14
**Método:** lectura de código, sin ejecutar la app. Cada celda cita `archivo:línea` leída de verdad.
**Alcance:** qué pantalla debería ser *dueña* de cada dato y qué sobra en las demás.

---

## 0. Criterio de lectura

Distingo tres cosas, porque no toda repetición es un defecto:

- **Repetición con la misma función** (malo): el mismo hecho, con el mismo propósito, en dos sitios. El usuario no sabe cuál es la fuente de verdad y ninguno de los dos gana autoridad.
- **Repetición con función distinta** (a menudo correcto): Hoy = *ejecutar*, Metas = *navegar*, Progreso = *contemplar*. El mismo número sirve para cosas distintas.
- **Repetición con cálculos distintos** (siempre malo): el mismo hecho calculado dos veces con reglas distintas. No es ruido, es contradicción.

Notación de la matriz: **P** = principal (protagonista de la pantalla) · **S** = secundario (fila/subtítulo) · **F** = plegado (Disclosure/details/menú) · **C** = chip/tag · **–** = no aparece.

---

## 1. Matriz dato × pantalla

### 1.1 Metas y su progreso

| Dato | Hoy | Metas | GoalDetail | Agenda | Progreso | Revisión | SessionRun | GoalCreated | Hábitos | Wizard |
|---|---|---|---|---|---|---|---|---|---|---|
| Título de la meta | S `Today.tsx:623`, `SessionCard.tsx:99` | **P** `Goals.tsx:285` | **P** `GoalDetail.tsx:453` | S `AgendaRow.tsx:69`, C `DayAgenda.tsx:169` | S `Progress.tsx:279`, S `Progress.tsx:441` | **P** `Review.tsx:218` | S `SessionRun.tsx:438` | S `GoalCreated.tsx:91` | C `Habits.tsx:645` | S `Wizard.tsx:520` |
| **Etapa actual / total ("Etapa X de Y")** | – | S `Goals.tsx:326` | C `GoalDetail.tsx:474` | – | S `Progress.tsx:296-300` | **P** `Review.tsx:229-232` | S `SessionRun.tsx:439-441` | P (Roadmap) `GoalCreated.tsx:99-102` | – | – |
| Barra de % de progreso | – | S `Goals.tsx:317-321` | S `GoalDetail.tsx:477-479` | – | S `Progress.tsx:287-295` | – | – | – | – | – |
| Lista completa de etapas (el camino) | – | – | **P** `GoalDetail.tsx:543-552` | – | – | S `Review.tsx:233-240` (actual→siguiente) | S `SessionRun.tsx:476` (solo la actual) | **P** `GoalCreated.tsx:99-102` | – | P `Wizard.tsx:385-391` |
| **Porqué de la meta** | – | S `Goals.tsx:234` (peek) | **P** `GoalDetail.tsx:458-466` | – | – | F `Review.tsx:220-224` | S `SessionRun.tsx:555`, `:574-576` | S `GoalCreated.tsx:92` | – | F `Wizard.tsx:532-537` |
| Fecha límite | – | C `Goals.tsx:310-314` | C `GoalDetail.tsx:440-444` **y** F `GoalDetail.tsx:594-596` | C `DayAgenda.tsx:158-171` | – | – | – | – | – | C `Wizard.tsx:526-530` |
| Estado (pausada/lograda/archivada) | – | C `Goals.tsx:308` | C `GoalDetail.tsx:435-439` | – | C `Progress.tsx:436-438`, S `:445` | – | – | – | C `Habits.tsx:646` | – |
| Área / nicho (glifo + color) | S `Today.tsx:782`, `SessionCard.tsx:98` | S `Goals.tsx:284` | S `GoalDetail.tsx:434` + F `:592` | S `AgendaRow.tsx:48` | S `Progress.tsx:278` | S `Review.tsx:218` | S `SessionRun.tsx:437` | – | S `Habits.tsx:563` | C `Wizard.tsx:525` |
| Tipo de meta (plantilla) | – | – | F `GoalDetail.tsx:593` | – | – | – | – | – | – | C `Wizard.tsx:524` |
| "Lo logras cuando" | – | – | F `GoalDetail.tsx:597` | – | – | – | – | – | – | S `Wizard.tsx:538-542` |
| Meta prioritaria (⭐) | orden implícito `Today.tsx:232-236` | **P** `Goals.tsx:286-307` | – | – | – | – | – | – | – | – |

### 1.2 Sesiones y compromiso

| Dato | Hoy | Metas | GoalDetail | Agenda | Progreso | Revisión | SessionRun | GoalCreated | Perfil |
|---|---|---|---|---|---|---|---|---|---|
| **Sesiones de hoy + estado** | **P** `Today.tsx:711-768` (SessionCard) | – | – | **P** `AgendaRow.tsx:51-84` + `Calendar.tsx:716` | – | – | **P** `SessionRun.tsx:549-620` | – | – |
| Contador "X de Y sesiones hoy" | S `Today.tsx:572-582` | – | – | S (semana) `agendaItems.ts:142-144` | S `Progress.tsx:198-204` | – | – | – | – |
| Sesiones cumplidas esta semana | – | – | S `GoalDetail.tsx:481` | S `agendaItems.ts:142-144` | **P** `Progress.tsx:198-204` + S `:281-285` | S `Review.tsx:241-245` | – | – | – |
| **Compromiso semanal (días · horas)** | – | – | **P** `GoalDetail.tsx:498-505` | S proyectada `AgendaRow.tsx:56-58` | – | – | – | **P** `GoalCreated.tsx:105-117` | – |
| Objetivo de la sesión (25 min / N uds) | S `SessionCard.tsx:43` | – | – | S `AgendaRow.tsx:57` | – | – | **P** `SessionRun.tsx:438,552` | – | default `Profile.tsx:208-238` |
| Hora planificada | S `SessionCard.tsx:41` | – | – | **P** `AgendaRow.tsx:25-31` | – | – | S `SessionRun.tsx:553` | S `GoalCreated.tsx:124-128` | – |
| **Plan de la sesión ("X de Y")** | S `SessionCard.tsx:44` | – | – | S `AgendaRow.tsx:58` + hoja `Calendar.tsx:748-776` | – | – | F `SessionRun.tsx:678-680` | – | – |
| Sesiones totales / minutos invertidos | – | – | S `GoalDetail.tsx:482-483` | – | – | – | – | – | – |
| Avances (notas por sesión) | prompt `Today.tsx:736-763` | – | **P** `GoalDetail.tsx:572-585` (3 + `Disclosure`) | – | – | – | input `SessionRun.tsx:454-471` | – | – |
| Sesión en curso (reloj) | **P** `Today.tsx:617-633` | – | – | ▶ `AgendaRow.tsx:73-76` | – | – | **P** `SessionRun.tsx:563-572` | – | – |

### 1.3 Racha, constancia y semana

| Dato | Hoy | Metas | GoalDetail | Agenda | Progreso | Perfil | TopBar/SideNav | Hábitos |
|---|---|---|---|---|---|---|---|---|
| **Racha global de días** | C `Today.tsx:565-569` | – | – | – | C `Progress.tsx:163-167` | **P** `Profile.tsx:245` | anillo `TopBar.tsx:65` · texto `SideNav.tsx:75` | – |
| Récord de racha | aviso `Today.tsx:646` | – | – | – | C `Progress.tsx:165` | – | – | – |
| **Marco / insignia** | – | – | – | – | – | **P** `Profile.tsx:242-287` | `TopBar.tsx:65`, `SideNav.tsx:75` | – |
| **Tira de 7 días (estado por día)** | **P** `Today.tsx:587-614` | – | – | **P** `Calendar.tsx:688-712` | S `Progress.tsx:206-250` | – | – | S/hábito `Habits.tsx:590-598` |
| Histórico 8 semanas | – | – | – | – | F `Progress.tsx:357-378` | – | – | – |
| Línea de tiempo "Tu camino" | – | link `Goals.tsx:184-195` | – | – | **P** `Progress.tsx:382-400` | – | – | – |

### 1.4 Hábitos

| Dato | Hoy | GoalDetail | Agenda | Progreso | Hábitos | Learn |
|---|---|---|---|---|---|---|
| **Hábito de hoy + check** | **P** `Today.tsx:807-834` (`HabitRow`) | S `GoalDetail.tsx:605-653` | S `AgendaRow.tsx:87-115` | – | **P** `Habits.tsx:551-587` | – |
| Repeticiones "N de M hoy" | S `HabitRow.tsx:62-71` | S `GoalDetail.tsx:638-642` | S `AgendaRow.tsx:90-91` | – | C `Habits.tsx:568-570` | – |
| Próxima hora de repetición | S `HabitRow.tsx:64` | – | S `AgendaRow.tsx:91` | – | F `Habits.tsx:621-624` | – |
| **Racha del hábito** | C `HabitRow.tsx:73-77` | C `GoalDetail.tsx:643-647` | – | C `Progress.tsx:334-338` | C `Habits.tsx:573-577` | – |
| Semana del hábito (7 puntos) | – | – | – | S `Progress.tsx:340-348` | S `Habits.tsx:590-598` | – |
| Días del hábito (pauta) | – | – | – | – | S `Habits.tsx:567` + F `Habits.tsx:602-615` | – |
| Meta vinculada al hábito | – | **P** (la sección entera) | – | – | F `Habits.tsx:627-649` | – |
| Ideas de hábitos | – | – | – | – | **P**/F `Habits.tsx:668-681` | CTA `Learn.tsx:156-157` |

### 1.5 Agenda, tareas y contenido

| Dato | Hoy | Agenda | Progreso | Learn | SessionRun | Perfil |
|---|---|---|---|---|---|---|
| **Eventos del día** | S `Today.tsx:908-930` | **P** `AgendaRow.tsx:118-143` | – | – | F `SessionRun.tsx:687-713` | – |
| Eventos "todo el día" | – | C `DayAgenda.tsx:172-179` | – | – | – | – |
| Tareas propias de hoy | **P** `Today.tsx:874-888` | – | – | – | – | – |
| Tareas pendientes de ayer | S `Today.tsx:856-873` | – | – | – | – | – |
| Huecos libres planificables | – | **P** `DayAgenda.tsx:118-128` | – | – | – | – |
| Sugerencia de contenido | – | – | – | **P** `Learn.tsx:427-468` | C `SessionRun.tsx:495-497` | – |
| Ideas de metas | link `Today.tsx:796` | – | link `Goals.tsx:159` | CTA `Learn.tsx:160-161` | – | – |
| Email / identidad | – | – | – | – | – | **P** `Profile.tsx:164-166` · `SideNav.tsx:71-73` |
| Minutos por defecto de sesión | – | – | – | – | – | **P** `Profile.tsx:208-238` |

---

## 2. Hallazgos

### F1 — La racha global vive en 4 superficies y se calcula de 3 maneras distintas · **P1** · costo **S**

| Superficie | Línea | Cálculo |
|---|---|---|
| Hoy (chip 🔥) | `Today.tsx:565-569`, cálculo en `:249-255` | `blocks` **sin filtrar por meta activa** (`Today.tsx:253`), ventana 120 días (`:141`) |
| Progreso (chip 🔥 + récord) | `Progress.tsx:163-167`, cálculo en `:94-99` | `activeBlocks` filtrados a metas activas (`Progress.tsx:94`), ventana 120 días |
| Perfil ("Racha actual: N días") | `Profile.tsx:245`, fuente `Profile.tsx:33-37` | `fetchCurrentStreak` → filtra a metas activas (`services/profile.ts:183-184`), ventana **365** días (`:181`) |
| TopBar / SideNav (anillo + "racha de N") | `TopBar.tsx:65`, `SideNav.tsx:75` | misma clave de cache que Perfil |

Esto no es solo repetición: es **contradicción latente**. Con una meta pausada que tenía compromiso los martes, Hoy puede mostrar una racha distinta de la de Progreso y Perfil, en la misma sesión, sin explicación.

- **Dueña:** **Perfil** para la racha como identidad (número + marco). **Hoy** conserva el chip porque ahí la racha es *combustible de ejecución*, no estadística — función distinta, repetición legítima.
- **Recortar:** quitar el chip de racha de Progreso (`Progress.tsx:163-167`); ya lo llevan Hoy (arriba) y la SideNav (siempre visible). Y unificar el cálculo: que `Today.tsx:249-255` use `fetchCurrentStreak` o, como mínimo, filtre `blocks` a metas activas igual que `Progress.tsx:94`.
- **Nota de verificación:** el récord (`streakBroken.best`, `Today.tsx:646`; `best`, `Progress.tsx:100-103`) también se calcula dos veces con ventanas distintas (`-119` en ambos casos, `Today.tsx:268` y `Progress.tsx:102`) — ahí sí coinciden.

### F2 — "Etapa X de Y" aparece en 6 pantallas · **P1** · costo **M**

`Goals.tsx:326` · `GoalDetail.tsx:474` · `Progress.tsx:296-300` · `Review.tsx:229-232` · `SessionRun.tsx:439-441` · `GoalCreated.tsx:99-102`.

Cuatro de esas seis lo muestran **con la misma función**: "cuánto llevo de esta meta". Solo Revisión (es la pregunta de la pantalla) y SessionRun (contexto de *esta* sesión) lo justifican.

- **Dueña:** **GoalDetail** (`:470-485`), que además tiene la barra y el checklist real.
- **Recortar:**
  - `Progress.tsx:296-300`: la tarjeta de meta en Progreso ya tiene barra (`:287-295`) **y** "X/Y esta semana" (`:281-285`). Tres números por tarjeta. Quitar la línea de etapa y dejar barra + semana.
  - `Goals.tsx:315-329`: la tarjeta de Metas es un *navegador*. Barra sola basta; el texto "Etapa X de Y" (`:326`) es lo que hace que la tarjeta se lea igual que la de Progreso.
  - `SessionRun.tsx:439-441`: el kicker ya lleva meta + objetivo; la etapa vuelve a aparecer abajo como pregunta concreta (`:476`). Quitar del kicker.

### F3 — Hoy y Agenda-día muestran el mismo día con la misma función · **P1** · costo **M**

| Hecho | Hoy | Agenda (vista Día) |
|---|---|---|
| Sesiones de hoy | `Today.tsx:711-768` | `AgendaRow.tsx:51-84` vía `Calendar.tsx:716` |
| Hábitos de hoy + repeticiones | `Today.tsx:807-834` | `AgendaRow.tsx:87-115` |
| Eventos de hoy | `Today.tsx:908-930` | `AgendaRow.tsx:118-143` |
| Plan de la meta "X de Y" | `SessionCard.tsx:44` | `AgendaRow.tsx:58` |
| Estado de la sesión | `SessionCard.tsx:52-57` | `agendaItems.ts:58-75` |

La diferencia real es el **eje**: Hoy agrupa por *tipo* (sesiones / hábitos / tuyo / agenda), Agenda ordena por *hora*. Es una diferencia defendible, pero hoy está diluida porque Hoy también arrastra la agenda (`Today.tsx:908-930`) y el aside la trata como un cuarto bloque más.

- **Dueña de "qué pasa a qué hora":** **Agenda**. **Dueña de "qué hago ahora":** **Hoy**.
- **Recortar:** plegar la sección "Tu agenda de hoy" de Hoy (`Today.tsx:908-930`) dentro de un `Disclosure` con resumen `"Tu agenda de hoy · N"`, o reducirla a una sola línea-resumen con enlace. Los eventos sueltos no son accionables desde Hoy (cada botón solo navega a `/calendario`, `Today.tsx:922`): son navegación disfrazada de contenido.

### F4 — Progreso "Tus hábitos" es una copia de la pantalla Hábitos · **P1** · costo **S**

| Hecho | Progreso | Hábitos |
|---|---|---|
| Glifo + título | `Progress.tsx:330-333` | `Habits.tsx:563-565` |
| Chip de racha | `Progress.tsx:334-338` | `Habits.tsx:573-577` |
| 7 puntos de la semana | `Progress.tsx:340-348` | `Habits.tsx:590-598` |
| Acción al tocar | `navigate('/habitos')` `Progress.tsx:327` | (es la pantalla) |

Cada tarjeta de Progreso muestra **exactamente** los mismos tres datos que la fila de Hábitos, y al tocarla te lleva a Hábitos. Es una lista de enlaces que finge ser una sección de análisis. Encima el encabezado ya tiene un "Gestionar" que va al mismo sitio (`Progress.tsx:313-315`).

- **Dueña:** **Hábitos**.
- **Recortar:** sustituir toda la sección `Progress.tsx:309-354` por una línea agregada del tipo "3 hábitos activos · mejor racha 12 días → Ver hábitos". Si se quiere conservar algo en Progreso, que sea el dato que Hábitos **no** da: el agregado histórico, no la repetición fila a fila.

### F5 — La racha de hábito aparece en 4 pantallas · **P2** · costo **S**

`HabitRow.tsx:73-77` (Hoy) · `Habits.tsx:573-577` · `Progress.tsx:334-338` · `GoalDetail.tsx:643-647`.

En Hoy y Hábitos tiene función (refuerzo al marcar). En Progreso es redundante con F4. En GoalDetail es decorativo: la sección "Hábitos que suman" (`GoalDetail.tsx:605-653`) ya muestra check, título, "N de M hoy" y racha — cuatro datos para algo que es contexto de la meta.

- **Dueña:** **Hábitos** (con **Hoy** como copia de ejecución legítima).
- **Recortar:** `GoalDetail.tsx:643-647` (chip de racha) y `GoalDetail.tsx:638-642` ("N de M hoy"): dejar check + título. La tarjeta responde "¿qué hábitos alimentan esta meta?", no "¿cómo van?".

### F6 — El porqué de la meta se repite en 6 superficies · **P2** · costo **S**

`Goals.tsx:234` (peek) · `GoalDetail.tsx:458-466` · `Review.tsx:220-224` (ya plegado) · `SessionRun.tsx:555` y `:574-576` · `GoalCreated.tsx:92` · `Wizard.tsx:532-537`.

Aquí la repetición es **mayormente correcta**: el porqué es un ancla emocional y su valor está en aparecer en el momento de flaqueza. El código ya lo trabaja bien (SessionRun lo muestra antes de empezar `:555` y solo en pausa mientras corre `:574-576`; Revisión lo pliega `:220-224`).

- **Dueña:** **GoalDetail** como texto canónico; **SessionRun** como uso emocional.
- **Recortar:** `Goals.tsx:234` — el peek ya muestra título + siguiente etapa + botón; el porqué lo convierte en una mini-GoalDetail. Quitarlo y dejar el peek en dos datos.
- Ojo: `TaskItem.tsx:93-95` acepta `goalWhy` pero Hoy le pasa `null` (`Today.tsx:881`). Prop muerta — candidata a borrar, no a usar.

### F7 — La tira de 7 días existe en 5 variantes con 2 semánticas distintas · **P2** · costo **M**

| Superficie | Línea | Semántica |
|---|---|---|
| Hoy — weekstrip | `Today.tsx:587-614`, estados en `:438-446` | día comprometido cumplido/fallado; navega a `/calendario?d=` |
| Progreso — barras de la semana | `Progress.tsx:206-250`, estados en `:106-115` | idéntica semántica, otra forma visual |
| Agenda — acordeón de semana | `Calendar.tsx:688-712` + `agendaItems.ts:126-160` | resumen textual del día |
| Hábitos — puntitos por hábito | `Habits.tsx:590-598` | semana **de ese hábito** |
| Progreso — puntitos por hábito | `Progress.tsx:340-348` | idem (ver F4) |

`Today.tsx:438-446` y `Progress.tsx:106-115` son **la misma función duplicada con reglas ligeramente distintas** (Hoy mira `history`/`sessions` según la fecha; Progreso mira un único array `sessions`; Hoy trata "hoy sin compromiso pero con sesiones" como `future`, Progreso también, pero por otro camino). Dos implementaciones del mismo estado visual es deuda esperando divergir.

- **Dueña:** **Hoy** (orientación rápida) y **Agenda** (detalle real).
- **Recortar:** extraer un único `dayState()` a `src/domain/` y que Hoy y Progreso lo usen. Después, quitar las barras de Progreso (`Progress.tsx:206-250`) o el weekstrip de Hoy — pero no antes de unificar, o se arregla la repetición y se deja la contradicción.

### F8 — El "plan de la sesión (X de Y)" aparece en 4 sitios · **P2** · costo **S**

`SessionCard.tsx:44` (Hoy) · `AgendaRow.tsx:58` (Agenda) · `Calendar.tsx:748-776` (hoja de bloque) · `SessionRun.tsx:678-680` (Disclosure).

La dieta ya hizo bien su trabajo en SessionRun (plegado). El problema es que el mismo contador se calcula en tres sitios distintos: `Today.tsx:340-350`, `DayAgenda.tsx:60-78`, y dentro de SessionRun.

- **Dueña:** **SessionRun** (es donde se tacha) y la **hoja de bloque** de Agenda.
- **Recortar:** `SessionCard.tsx:44` — en Hoy el contador de plan no es accionable (no se puede tachar desde ahí). Quitarlo del hint y dejar hora + objetivo.

### F9 — Perfil vs Progreso: dos pantallas de "cómo voy" · **P2** · costo **S**

| Hecho | Perfil | Progreso |
|---|---|---|
| Racha actual | `Profile.tsx:245` | `Progress.tsx:163-167` |
| Récord | – | `Progress.tsx:165` |
| Marco ganado | `Profile.tsx:246-250` + F `:252-286` | – |
| Semana cumplida | – | `Progress.tsx:198-204` |

No es un solapamiento total, pero el usuario tiene que ir a **Perfil** (bajo un avatar en la barra superior) para ver su racha "oficial" y a **Progreso** (una pestaña propia) para ver otra racha. La navegación sugiere que Progreso es la casa de las estadísticas; el código dice que la racha vive en Perfil.

- **Dueña:** **Progreso** para constancia y semana; **Perfil** solo para el marco como identidad + ajustes.
- **Recortar:** `Profile.tsx:244-251` puede quedarse en "Tu marco: **Bronce**" sin repetir el número de días, que ya está en Progreso y en la SideNav (`SideNav.tsx:75`).

### F10 — Revisión vs Progreso: mismo contexto de decisión · **P2** · costo **S**

Revisión muestra por meta: etapa X de Y (`Review.tsx:229-232`), etapa actual → siguiente (`:233-240`) y sesiones de la semana (`:241-245`). Progreso muestra por meta: barra (`:287-295`), "X/Y esta semana" (`:281-285`) y etapa (`:296-300`).

Aquí la repetición es **con función distinta y defendible**: Revisión es un flujo de decisión meta a meta, Progreso es contemplación. No tocaría el contenido. Sí anotaría que el cierre de Revisión manda a Progreso (`Review.tsx:164-166`), que es exactamente donde el usuario vuelve a ver lo que acaba de revisar.

- **Recortar:** nada del contenido. Cambiar el CTA final de `Review.tsx:164` de "Ver cómo vas" (→ Progreso) a "Volver a hoy" como acción primaria, e invertir la jerarquía con `:167`.

### F11 — GoalCreated vs GoalDetail: la meta se presenta dos veces · **P2** · costo **S**

| Hecho | GoalCreated | GoalDetail |
|---|---|---|
| Título | `:91` | `:453` |
| Porqué | `:92` | `:458-466` |
| El camino | Roadmap `:99-102` | MilestoneChecklist `:543-552` |
| Compromiso (chips) | `:109-113` | `:498-505` |
| Compromiso (frase) | `:115` | – |

GoalCreated es un **momento de celebración**, no una ficha. Justifica repetir, pero hoy repite *todo* y además la pantalla ofrece dos salidas (`:134` a Hoy, `:142` a GoalDetail) que vuelven a mostrar lo mismo.

- **Dueña:** **GoalDetail**.
- **Recortar:** quitar el bloque de compromiso completo de GoalCreated (`GoalCreated.tsx:105-117`) o reducirlo a "Tu primera sesión" (`:119-130`), que es el único dato que GoalDetail **no** da y el único accionable.

### F12 — La fecha límite y el compromiso se repiten con formatos distintos · **P3** · costo **S**

Fecha límite: `Goals.tsx:310-314` (relativa), `GoalDetail.tsx:440-444` (relativa) **y** `GoalDetail.tsx:594-596` (absoluta, plegada), `DayAgenda.tsx:158-171` (chip en el día), `Wizard.tsx:526-530` (ambas: `formatLongDate` + `relativeDeadline`).
Compromiso: `GoalDetail.tsx:498-505`, `GoalCreated.tsx:109-117`, `CommitmentStep.tsx:406`, `Wizard.tsx:455`.

- **Dueña:** **GoalDetail** para ambos.
- **Recortar:** ver F14 (intra-pantalla).

### F13 — Ideas y sugerencias salen de 4 catálogos en 4 pantallas · **P3** · costo **M**

`Habits.tsx:46` (`HABIT_IDEAS`, mostrado en `:668-681`) · `domain/recommendations.ts:74` (`suggestionsForNiche`, en `GoalSuggestions.tsx:35`) · `content/learn.ts:26` (`LEARN_COLLECTIONS`) con CTA que crea hábitos y metas (`Learn.tsx:155-163`) · `domain/sessions.ts:59` (`pickSuggestion`, chip en `SessionRun.tsx:495-497`).

Cuatro fuentes de "qué podrías hacer", sin relación entre ellas: la lección de Learn puede proponer un hábito que ya está en `HABIT_IDEAS`, y nada lo detecta. No es información *repetida en pantalla*, es **autoridad repartida**. Riesgo de que el usuario vea la misma idea tres veces con tres marcos distintos.

- **Dueña:** **Learn** para "qué aprender", **GoalSuggestions** para "qué meta adoptar", **Hábitos** para "qué hábito sumar".
- **Recortar:** a corto plazo, nada de código. A medio plazo, que `HABIT_IDEAS` (`Habits.tsx:46`) y los CTA de hábito de Learn compartan catálogo. Lo dejo marcado como **por verificar** si hay solapamiento literal de títulos: no comparé los strings uno a uno.

### F14 — Learn vs Habits ("ideas") · **P3** · costo **S**

Learn ofrece crear un hábito desde una lección (`Learn.tsx:156-157`, navega a `/habitos?nuevo=…`), y Hábitos ofrece su propio muro de ideas (`Habits.tsx:668-681`). El *handoff* está bien resuelto (Learn precarga el formulario). No hay repetición de datos, solo de intención.

- **Recortar:** nada. Función distinta, ejecución correcta.

---

## 3. Redundancia intra-pantalla residual (tras la dieta)

| # | Pantalla | Mismo hecho, dos veces | Severidad |
|---|---|---|---|
| R1 | **GoalCreated** | Compromiso como chips (`:109-113`) **y** como frase (`:115`, `formatCommitmentSummary`) en la **misma tarjeta** | **P2** |
| R2 | **GoalDetail** | Fecha límite como tag relativo (`:440-444`) **y** como "Para cuándo" absoluta dentro de `Disclosure` "Detalles" (`:594-596`) | P3 |
| R3 | **GoalDetail** | Progreso tres veces: tag "Etapa X de Y" (`:474`), barra (`:477-479`) y checklist real (`:543-552`) | P3 |
| R4 | **GoalDetail** | Área visible como glifo (`:434`) y repetida como texto en `Disclosure` (`:592`) | P3 |
| R5 | **Progreso** | La semana tres veces en la misma tarjeta: chip de racha (`:163-167`), anillo X/Y (`:198-204`) y barras por día (`:206-250`) | **P2** |
| R6 | **Hábitos** | Los días del hábito tres veces: `pautaLabel` (`:567`), puntos de la semana (`:590-598`) y chips editables en el menú (`:602-615`) — los dos primeros siempre visibles a la vez | **P2** |
| R7 | **Hoy** | Subtítulo "X de Y sesiones" (`:575`) + estado individual en cada `SessionCard` (`:727-735`) | P3 — resumen legítimo, no tocar |
| R8 | **Wizard** | `formatCommitmentSummary` en el paso 2 (`CommitmentStep.tsx:406`) y otra vez en el paso 5 (`Wizard.tsx:455`) | P3 — paso de revisión, legítimo |
| R9 | **Learn** | Barra de progreso de colección en la tarjeta raíz (`:448-452`) y otra vez al abrirla (`:346-348`) | P3 — continuidad, legítimo |

---

## 4. Top 8 acciones (ordenadas por impacto/costo)

| # | Acción | Archivo:línea | Cambio concreto | Sev. | Costo |
|---|---|---|---|---|---|
| 1 | **Unificar el cálculo de la racha** | `Today.tsx:253` | Cambiar `new Set(blocks.map(b => b.weekday))` por el mismo filtro de `Progress.tsx:94` (`blocks.filter(b => goalById.get(b.goalId)?.status === 'active')`). Hoy, Progreso y Perfil dejan de poder mostrar tres números distintos. | P1 | S |
| 2 | **Vaciar "Tus hábitos" de Progreso** | `Progress.tsx:309-354` | Borrar la sección entera y dejar una línea agregada + enlace ("N hábitos activos · mejor racha M → Ver hábitos"). Elimina de golpe 3 datos × N hábitos duplicados de `Habits.tsx:551-598`. | P1 | S |
| 3 | **Quitar "Etapa X de Y" de Progreso y Metas** | `Progress.tsx:296-300`, `Goals.tsx:323-327` | Borrar el `<span className="faint tiny">` de etapa en ambas. La barra ya comunica el avance; Metas navega, Progreso contempla. Deja a GoalDetail como dueña. | P1 | S |
| 4 | **Plegar la agenda de Hoy** | `Today.tsx:908-930` | Envolver la `<section>` en `<Disclosure summary={\`Tu agenda de hoy · ${todayEvents.length}\`}>`. Los eventos solo navegan a `/calendario` (`:922`): son enlaces, no ejecución. | P1 | S |
| 5 | **Fusionar el compromiso duplicado en GoalCreated** | `GoalCreated.tsx:108-115` | Borrar el `<div className="row wrap">` de chips (`:108-114`) y dejar solo `formatCommitmentSummary` (`:115`). Una frase, no una frase + siete tags que dicen lo mismo. | P2 | S |
| 6 | **Adelgazar "Hábitos que suman" en GoalDetail** | `GoalDetail.tsx:638-647` | Borrar el `<span className="faint tiny">{doneCount} de {target} hoy</span>` (`:638-642`) y el `streak-chip` (`:643-647`). Quedan check + título: contexto, no panel. | P2 | S |
| 7 | **Extraer `dayState()` a dominio** | `Today.tsx:438-446` + `Progress.tsx:106-115` | Mover a `src/domain/` una única función de estado de día y consumirla desde ambas. Prerequisito para poder quitar después una de las dos tiras sin romper la otra. | P2 | M |
| 8 | **Quitar el plan y la etapa de las superficies no accionables** | `SessionCard.tsx:44`, `SessionRun.tsx:439-441` | En `sessionHint`, borrar `if (plan && plan.total > 0) parts.push(...)`: en Hoy el plan no se puede tachar. En SessionRun, quitar el fragmento `· Etapa X de Y` del kicker: la etapa ya se pregunta al cerrar (`:476`). | P2 | S |

**Adicionales de bajo costo (fuera del top 8):** quitar el porqué del peek de Metas (`Goals.tsx:234`); quitar el chip de racha de Progreso (`Progress.tsx:163-167`) una vez hecha la acción 1; quitar "Para cuándo" del Disclosure de GoalDetail (`:594-596`) o el tag de cabecera (`:440-444`), no ambos; borrar la prop muerta `goalWhy` de `TaskItem.tsx:93-95` (Hoy le pasa `null` en `Today.tsx:881`).

---

## 5. Resumen de severidades

| Severidad | Hallazgos |
|---|---|
| **P0** | 0 |
| **P1** | 4 — F1 (racha inconsistente), F2 (etapa X de Y ×6), F3 (Hoy vs Agenda-día), F4 (Progreso copia Hábitos) |
| **P2** | 6 — F5 (racha de hábito ×4), F6 (porqué ×6), F7 (tira de 7 días ×5), F8 (plan ×4), F9 (Perfil vs Progreso), F11 (GoalCreated vs GoalDetail) |
| **P3** | 4 — F10 (Revisión vs Progreso, aceptable), F12 (fecha/compromiso), F13 (4 catálogos de ideas), F14 (Learn vs Habits, aceptable) |
| Intra-pantalla | 9 items (R1-R9), de los cuales 3 son P2 y 3 son legítimos |

**Lectura de una línea:** la app no comparte "demasiada" información — comparte la información *correcta* en pantallas que no la mandan. Progreso se ha convertido en un espejo de Hoy, Hábitos y Metas a la vez, y la racha se calcula tres veces. Casi todo el arreglo son borrados de líneas, no rediseño.
