# Auditoría de front de Lógralo — septiembre 2026

> Auditoría del 2026-09-14 sobre la rama `feat/dieta-fase3` (incluye los PR #1, #2 y #3, sin fusionar). Cuatro auditores en paralelo, uno por frente: **información repetida entre pantallas**, **voz automática ("mucha IA")**, **íconos** y **animaciones / sensación premium**. Solo código: no había sesión real para capturas de pantalla. Los hallazgos principales de cada informe se verificaron a mano contra el código (línea por línea) antes de entrar aquí; los que no se pudieron verificar se marcan "por verificar". El detector de diseño de Impeccable corrió sobre `src/screens`, `src/components` y `src/app`: un solo aviso (easing `spring` en `src/screens/Goals.tsx:63`).
>
> Sobre "hay mucha IA": en `src/` no hay ninguna llamada a un modelo (ni OpenAI, ni Gemini, ni Groq). Lo que existe es una capa determinista de sugerencias, ideas, pistas, celebraciones y veredictos. Se auditó esa **voz automática**: dónde la app habla, decide o interpreta por el usuario.
>
> Detalle completo por frente en `docs/auditorias/2026-09/` (A-redundancia, B-voz-automatica, C-iconos, D-motion).

## Veredicto global

1. **La dieta de información limpió las pantallas, pero ningún dato tiene todavía "dueño".** La racha se calcula de tres formas distintas y puede mostrar tres números a la vez; "Etapa X de Y" vive en cuatro pantallas; la sección "Tus hábitos" de Progreso es una copia de la pantalla Hábitos; "Tu agenda de hoy" en Hoy solo navega. Casi todo el arreglo son borrados de líneas.
2. **La sensación de "mucha IA" no es cantidad, es falta de presupuesto.** Cada pantalla decide sola si habla. Hoy puede apilar hasta siete avisos (celebración, racha rota, pendiente de confirmar, revisión, olvidada, pista, arrastre de ayer) porque solo tres comparten un slot. Y la pista "decir 'no pude' no rompe nada" se muestra también bajo "¡Lo lograste!". Ese último defecto nace en el PR #3 de esta misma serie.
3. **El set de íconos está bien fundado y mal calibrado.** Un solo `viewBox`, `currentColor`, todos con `aria-hidden`, ningún botón sin nombre accesible, cero emoji. Pero cinco de los nueve checks no dibujan el ✓, la ✕ significa "cerrar" y "borrar", la pestaña Hoy es el mismo dibujo que el sol de "tema claro", y los glifos de nicho no llegan a 3:1 en tema claro.
4. **El motion tiene tokens que nadie usa y momentos que nadie animó.** 24 duraciones distintas, `ease` del navegador en la mayoría de sitios, `--ease-spring` y `--ease-ios` con cero usos. La regla global de movimiento reducido convierte seis animaciones infinitas en estroboscopio. Los sheets entran en 320 ms y salen en cero. Desplegar un bloque de la agenda no se anima. Las View Transitions de ruta nunca se ejecutan. "Etapa cumplida" y "¡Meta lograda!" son un toast de texto.
5. **Nada bloquea al usuario (ningún P0).** Casi todo es coste S. Las tres olas del plan final cubren el 80 % del efecto con unas 30 ediciones.

Severidades: **P1** arreglar antes del próximo despliegue · **P2** siguiente pasada · **P3** pulido. Coste: **S** menos de una hora · **M** medio día · **L** más.

---

## 1. Información repetida entre pantallas

Criterio: un dato puede repetirse si cumple una **función distinta** en cada pantalla (Hoy ejecuta, Metas navega, Progreso contempla). Se marca como redundante cuando aparece con la misma función o con cálculos que no cuadran.

| # | Hallazgo | Evidencia | Sev. | Coste | Arreglo |
|---|---|---|---|---|---|
| F1 | **La racha global se calcula de tres formas.** Hoy cuenta los bloques de todas las metas; Progreso y Perfil solo los de metas activas; Perfil además limita a 365 días. Tres superficies pueden mostrar tres números. | `src/screens/Today.tsx:249-255` · `src/screens/Progress.tsx:94-96` · `src/services/profile.ts:176-189` | P1 | S | Mover el cálculo a `src/domain/` con una sola firma y consumirlo desde los tres sitios; como mínimo, aplicar en Hoy el filtro de metas activas de Progreso. |
| F2 | **"Etapa X de Y" en cuatro pantallas.** Metas y Progreso ya tienen barra de avance; el texto no aporta. | `src/screens/Goals.tsx:326` · `src/screens/GoalDetail.tsx:474` · `src/screens/Progress.tsx:298` · `src/screens/SessionRun.tsx:440` | P1 | S | Dejarlo en Detalle de meta (dueña) y en Sesión (allí se pregunta la etapa al cerrar). Borrar el `span` en Metas y Progreso. |
| F3 | **Progreso "Tus hábitos" es la fila de Hábitos repetida**: mismo glifo, título, racha y tira de 7 días, y al tocar navega a Hábitos. | `src/screens/Progress.tsx:309-354` vs `src/screens/Habits.tsx:551-598` | P1 | S | Sustituir la sección por una línea agregada: "N hábitos activos · mejor racha M → Ver hábitos". |
| F4 | **Hoy y Agenda del día muestran el mismo día.** La sección "Tu agenda de hoy" de Hoy lista los eventos, pero cada fila solo navega al calendario: son enlaces, no ejecución. | `src/screens/Today.tsx:908-930` | P1 | S | Plegar en un `Disclosure` con resumen "Tu agenda de hoy · N", o reducir a un solo enlace "Ver agenda (N eventos)". |
| F5 | **Hábitos dentro de Detalle de meta con panel completo**: "N de M hoy" y chip de racha, que ya viven en Hoy y Hábitos. | `src/screens/GoalDetail.tsx:638-647` | P2 | S | Dejar check + título: es contexto de la meta, no un panel de hábitos. |
| F6 | **GoalCreated muestra el compromiso dos veces** en la misma tarjeta: chips por día y la frase resumen. | `src/screens/GoalCreated.tsx:108-115` | P2 | S | Borrar los chips (`:108-114`), dejar la frase (`:115`). |
| F7 | **El porqué de la meta aparece en seis superficies**, incluido el peek de Metas, donde compite con "Siguiente: …". | `src/screens/Goals.tsx:234` y Detalle, Sesión, Revisión, GoalCreated, Hoy (TaskItem) | P2 | S | Dueñas: Detalle de meta y Sesión (motivación al empezar). Quitarlo del peek de Metas. |
| F8 | **La tira de 7 días existe en cinco variantes con dos semánticas**: `stripState` en Hoy y `dayState` en Progreso deciden "hecho / parcial / fallado / libre" con reglas distintas. | `src/screens/Today.tsx:438-446` vs `src/screens/Progress.tsx:106-115` | P2 | M | Extraer una sola función de estado de día a `src/domain/` y consumirla desde ambas. Prerrequisito para retirar una de las dos tiras. |
| F9 | **Prop muerta** `goalWhy` en TaskItem: Hoy le pasa `null`, el componente sigue reservando la línea "Porque …". | `src/components/TaskItem.tsx:93-95` · `src/screens/Today.tsx:881` | P3 | S | Borrar la prop y la línea. |
| F10 | Perfil vs Progreso ("cómo voy") y Revisión vs Progreso comparten contexto pero con función distinta (identidad / contemplación / decisión). | — | P3 | — | Aceptable. No tocar. |

**Resumen del frente:** 4 P1 · 4 P2 · 2 P3. La app no comparte "demasiada" información: comparte la información correcta en pantallas que no la mandan.

---

## 2. Voz automática ("mucha IA")

Inventario: **40 puntos de voz** (sugerencias de meta, ideas de hábito, idea de contenido de sesión, pistas, celebraciones, avisos contextuales, interpretaciones de datos, contenido de Aprender, plantillas). Veredicto del auditor: **18 mantener · 13 plegar · 9 quitar**. Dato que enmarca: `Calendar.tsx` (1690 líneas) no sugiere nada, `Habits.tsx:668-680` ya pliega sus ideas en un `Disclosure`, y en toda la app hay solo tres `<Hint>`. El patrón correcto ya existe; no se aplicó en Hoy ni en Sesión.

| # | Hallazgo | Evidencia | Sev. | Coste | Arreglo |
|---|---|---|---|---|---|
| V1 | **La app consuela a quien acaba de ganar.** El `<Hint>` "Decir 'no pude' no rompe nada" está dentro de `ResolutionOptions` sin condición, y ese componente también se renderiza con `title="¡Lo lograste!"`. Nace en el PR #3 (Fase 3). | `src/screens/SessionRun.tsx:115` · usos en `:503`, `:534-535`, `:608` | P1 | S | Prop `showMissedHint` en `ResolutionOptions`; pasarla solo desde la sesión abierta y el cierre anticipado, nunca desde el cierre por objetivo alcanzado. |
| V2 | **Sin presupuesto de voz en Hoy.** La constante `notice` desduplica tres avisos (sin confirmar > revisión > olvidada), pero la celebración, la racha rota, la pista de parcial y el arrastre de ayer quedan fuera: hasta siete voces apiladas, tres con botones. | `src/screens/Today.tsx:558` · `:635` · `:641` · `:656` · `:672` · `:688` · `:718` · `:856` | P1 | M | Un solo slot: consecuencia de una acción del usuario > pregunta que la app necesita > sugerencia. Renderizar exactamente una voz (dos como máximo si una es la celebración efímera). |
| V3 | **Eco literal.** `cheer('Cumpliste tu compromiso de hoy. Bien hecho.')` y el subtítulo "Cumpliste tu compromiso de hoy." se muestran a la vez. Igual "Hoy no pudiste" en el subtítulo de Hoy y en la tarjeta de sesión. | `src/screens/Today.tsx:386` vs `:577` · `Today.tsx:579` vs `src/components/SessionCard.tsx:57` | P1 | S | Quitar el cheer de `:386` (el subtítulo persiste y ya lo dice); en `SessionCard.tsx:57` poner un dato ("Sin cumplir"), no un veredicto. |
| V4 | **La "idea de contenido" no sabe nada de la meta.** `pickSuggestion` rota el pool por `(día + hash(meta)) % n`: ignora etapa, título y porqué, y se muestra en cada sesión pendiente. | `src/domain/sessions.ts:59-64` · `src/screens/SessionRun.tsx:263, 493-498` | P2 | M | Plegarla dentro del `Disclosure` del plan (`SessionRun.tsx:672`) con resumen "Ideas para llenar la sesión", o mostrarla solo cuando la meta no tiene nada agendado hoy. |
| V5 | **El copy promete personalización que el código no hace.** "Preseleccionamos el más parecido a tu meta" es un conteo de subcadenas (`detectTemplate`); "etapas sugeridas" son cinco hitos fijos por plantilla. | `src/screens/Wizard.tsx:344` · `Wizard.tsx:383` · `src/screens/GoalSuggestions.tsx:67-68` · `src/domain/templates.ts:512-526` | P2 | S | "Elegimos un tipo por las palabras de tu meta. Cámbialo si no encaja." · "El camino típico de este tipo de meta". |
| V6 | **Código muerto de la capa de "inteligencia".** Once bloques `kickoffActions` (55 frases) que nadie lee; `IconSparkles` con cero usos. | `src/domain/templates.ts` (11 bloques) · `src/lib/types.ts:113` · `src/components/icons.tsx:100-112` | P2 | S | Borrar. |
| V7 | **La gamificación vive en cinco superficies**: chip de racha en Hoy, anillo del marco en TopBar y SideNav, chip en Progreso, detalle en Perfil. El marco "Leyenda" es vocabulario de videojuego en una app que "guía, no exige". | `src/screens/Today.tsx:565` · `src/components/TopBar.tsx:65` · `src/components/SideNav.tsx:57` · `src/screens/Progress.tsx:163` · `src/screens/Profile.tsx:242-291` · `src/domain/frames.ts:27` | P2 | M | Racha en Progreso (dueña) y detalle en Perfil; quitar el chip de Hoy y el anillo permanente de las barras. Renombrar "Leyenda". |
| V8 | La pantalla de error usa el logo animado en tono celebratorio en vez de un ícono de alerta. | `src/components/ErrorBoundary.tsx:58` · `IconAlert` sin usar en `icons.tsx:261` | P3 | S | `IconAlert` con `--warning` salvo cuando el fallo sea "actualizamos la app". |

**Regla de voz propuesta** (cinco líneas, para el spec de producto):
1. La app habla cuando el usuario no puede saber algo mirando la pantalla; nunca para narrar lo que ya se ve.
2. Una voz por vista, con prioridad: consecuencia de una acción > pregunta que la app necesita > sugerencia.
3. Sugerir es ofrecer, no proponer: toda idea vive detrás de un gesto (pestaña, `Disclosure`, estado vacío).
4. Datos sí, veredictos no: "0 de 3 sesiones" siempre; "Bien hecho" una vez por evento y en una sola superficie.
5. El copy dice lo que el código hace: "camino típico", no "sugerido para tu meta".

---

## 3. Íconos

Lo que está bien y no hay que tocar: `viewBox` 24 único en los 44 íconos, `currentColor`, caps y joins redondos, `aria-hidden` en todos, ningún botón solo-ícono sin nombre accesible (revisados ~40 sitios), cero emoji en la interfaz. Recomendación sobre migrar a Lucide: **no**. Ningún P1 se arregla migrando; tomar prestada su disciplina (área segura ~20×20, trazo constante) y copiar sus paths solo en la docena de glifos genéricos.

| # | Hallazgo | Evidencia | Sev. | Coste | Arreglo |
|---|---|---|---|---|---|
| I1 | **El ✓ falta en cinco de los nueve checks**: son discos verdes lisos. En la misma fila de la agenda, un evento marcado y un hábito marcado tienen acabados distintos. | `src/components/HabitRow.tsx:46` · `src/screens/Habits.tsx:556` · `src/components/MilestoneChecklist.tsx:70` · `src/screens/calendar/AgendaRow.tsx:112` · `src/components/SessionCard.tsx:125` (con ✓: `TaskItem.tsx:80`, `EventCheck.tsx`, `GoalDetail.tsx:627`, `Learn.tsx:381`) | P1 | S | Insertar `<IconCheck size={16} />` (12 en el `--sm`). El CSS ya lo soporta (`components.css:379, 396`). Cinco líneas. |
| I2 | **La ✕ significa "cerrar" y "borrar".** `IconClose` cierra hojas en siete sitios y borra o quita en cinco; `IconTrash` existe y tiene cero usos. | `src/components/TaskItem.tsx:102` · `MilestoneChecklist.tsx:152` · `wizard/MilestonesStep.tsx:152` · `src/screens/Habits.tsx:117` · `wizard/CommitmentStep.tsx:165` · `icons.tsx:351` | P1 | S | `IconTrash` en las acciones destructivas; ✕ solo para cerrar. En TaskItem, ícono condicional como ya lo es el rótulo. |
| I3 | **Los glifos de nicho no llegan a 3:1 en tema claro.** La fórmula tiñe fondo y figura con el mismo tono; el auditor calculó 2,66–3,93:1 en claro (3 de 8 bajo el mínimo) frente a 5,6–6,9:1 en oscuro. Los puntos `.blk__dot` y `.wk-day__dot` usan `--niche` puro. *(Cifras por verificar en pantalla.)* | `src/styles/components.css:461-470` · `:3155` · `:3386` · `src/styles/tokens.css:81-88` | P1 | M | Fondo `niche 8 % sobre --surface`, figura `niche 55 % sobre --text` en claro (peor caso calculado: 5,04:1); mantener la fórmula actual en oscuro. |
| I4 | **`IconToday` e `IconSun` son el mismo dibujo** (difieren 0,2 unidades de radio): la pestaña Hoy se lee igual que "tema claro". | `src/components/icons.tsx:31-38` vs `:273-280` | P1 | M | Redibujar Hoy como cuadrado redondeado con ✓ interior (distinto de `IconCalendar`), o rellenar el núcleo del sol. |
| I5 | **`base()` amplifica el trazo en vez de calibrarlo.** Con `viewBox` 24 y `strokeWidth` 1,6–2, el trazo renderizado va de 0,73 px (size 11) a 4,7 px (size 56); hay 20 tamaños distintos, ocho consecutivos (11–18). | `src/components/icons.tsx:18` y ~150 llamadas | P2 | S+M | `strokeWidth = clamp(1.1, 33.6 / size, 2.4)` (trazo constante ≈1,4 px) y escala `12/14/16/20/24/32`. |
| I6 | **Navegación**: la pestaña activa se distingue solo por color; `IconProgress` es la mitad de alto que sus vecinos; el rótulo "Crecer" no coincide con ninguna pantalla (Progreso / Aprender); la llama es pestaña y métrica de racha a la vez. | `src/components/BottomNav.tsx:16-19` · `components.css:781, 1740-1748` · `icons.tsx:251-258` | P2 | M | Variante `filled` para el activo; enderezar `IconProgress`; renombrar la pestaña o la pantalla; separar la llama de la racha. |
| I7 | **`IconLightbulb` carga tres significados**: pista, idea de contenido, catálogo de ideas, "Aplícalo hoy". | `src/components/Hint.tsx:22` · `SessionRun.tsx:496` · `Learn.tsx:256` · `Wizard.tsx:336` · `Habits.tsx:672` | P2 | S | Bombilla solo para catálogos de ideas; `IconPlay` en "Aplícalo hoy"; la pista sin ícono o con `IconAlert` suave. |
| I8 | **"Siguiente" es `IconBack` espejado** con `scaleX(-1)`; la misma ranura de la agenda muestra un disco de 34 px o un chevron de 16 px. | `src/screens/Calendar.tsx:618-621` · `src/screens/calendar/AgendaRow.tsx:72-82` | P2 | S | `IconChevronRight size={24}`; `.ag-chev` con caja fija de 34 px. |
| I9 | **La marca es un PNG de 512×512 / 258 KB dibujado a 20 px**, con cuatro reglas `color:` inertes alrededor. Además, `public/logo-previews.png` (1400×1400, 924 KB) se despliega sin ninguna referencia en el código. | `src/assets/logo.png` · `public/favicon.png` · `public/logo-previews.png` · `src/components/TopBar.tsx:69` | P2 | S | Exportar `logo-96.png` para TopBar/SideNav, recomprimir el favicon, borrar `logo-previews.png` de `public/`. |
| I10 | Restos: campo `emoji` muerto en `niches.ts` y `templates.ts`; `IconFlag` descentrado 1,5 unidades; `IconQuote` es el glifo más plano del set; chevrons a 16 y 18 px; `IconCheck` a siete tamaños. | `src/domain/niches.ts:6, 13-20` · `icons.tsx:173-180` · `:163-170` | P3 | S | Limpieza en la misma pasada que I5. |

**Resumen del frente:** 4 P1 · 16 P2 · 10 P3 (30 hallazgos en el anexo C).

---

## 4. Animaciones y sensación premium

Inventario: 17 `@keyframes`, 37 `transition`, 19 `:active`, 0 `will-change`, 1 `vibrate`, 0 gestos. Tokens de curva en `src/styles/tokens.css:66-69`: `--ease-out` se usa; `--ease-spring` y `--ease-ios` tienen **cero usos** mientras sus literales aparecen cinco veces. **24 valores distintos de duración** y ningún token de duración.

| # | Hallazgo | Evidencia | Sev. | Coste | Arreglo |
|---|---|---|---|---|---|
| M1 | **La regla global de movimiento reducido no fija `animation-iteration-count`**: las seis animaciones `infinite` (skeletons, spinner, halo del roadmap) corren a 0,001 ms. Además borra el feedback significativo (check, barra, anillo), que debería sobrevivir como cambio de color. | `src/styles/base.css:169-176` · 6 `infinite` en `components.css` | P1 | S | Añadir `animation-iteration-count: 1 !important`; excepción con 150 ms para `.check`, `.progress__bar`, `.ring__bar`; quitar `scale` de `check-pop`/`celebrate-pop` bajo reduced-motion. |
| M2 | **Desplegar un bloque de la agenda, un día de la semana o un `Disclosure` no se anima**: el cuerpo se monta en seco y solo gira el chevron. Es el gesto central del rediseño. | `src/screens/calendar/AgendaBlock.tsx:73` (`{open && …}`) · `src/screens/calendar/WeekDay.tsx:69` · `src/components/Disclosure.tsx:22` (`<details>`) | P1 | M | Renderizar siempre el cuerpo (`inert` cuando está cerrado) dentro de un `grid` con `grid-template-rows: 0fr → 1fr` a 260 ms `--ease-out`. |
| M3 | **Las View Transitions de ruta nunca se ejecutan.** `@view-transition { navigation: auto }` solo aplica a navegación entre documentos; la app navega con React Router y no usa `viewTransition` ni `startViewTransition` (cero usos). 29 líneas inertes. | `src/styles/base.css:139-167` · `src/styles/components.css:2062-2073` | P1 | M | Activarlas con `navigate(to, { viewTransition: true })` y un `view-transition-name` compartido tarjeta de meta → detalle (permite retirar Blendy), o borrar las 29 líneas. |
| M4 | **Los sheets entran en 320 ms y salen en cero frames**; el grabber (`::before`) promete un arrastre que no existe (cero handlers de puntero). | `src/styles/components.css:1096-1110` · seis sheets en `src/screens/Calendar.tsx` · `src/screens/calendar/AddSheet.tsx:31` | P1 | M | Estado `closing` + `onAnimationEnd`: `sheet-down` 220 ms `--ease-ios`, backdrop 160 ms. Implementar el arrastre o quitar el grabber. |
| M5 | **El momento focal no existe.** "Etapa cumplida" y "¡Meta lograda!" son un toast de 13 px; `celebrate-pop` ya está escrito y calibrado y solo se usa en GoalCreated. | `src/screens/GoalDetail.tsx:202, 254` · `src/screens/Review.tsx:277, 306` · `components.css:852-867` | P1 | M | Tres escalas de un mismo lenguaje: check 220 ms → etapa 400 ms (pop en el nodo del roadmap) → meta 560 ms (overlay que se va solo, con háptico `[12,40,12]`). |
| M6 | **El anillo de sesión tartamudea**: el reloj avanza cada 1000 ms pero `.ring__bar` transiciona en 600 ms lineal (avanza 0,6 s, se para 0,4 s) durante toda la sesión. | `src/styles/components.css:2309` vs `src/screens/SessionRun.tsx:225` | P1 | S | `transition: stroke-dashoffset 1000ms linear`; al alcanzar el objetivo, `stroke` a `--success` y pop del tiempo. |
| M7 | **Sin sistema de duración.** 24 duraciones sueltas, `ease` por defecto en la mayoría de transiciones, tokens premium sin usar, `transition: width` muerta en `.progress__bar`. | `src/styles/tokens.css:66-69` · barrido por los 4 CSS | P1 | M | Cuatro tokens: `--dur-tap 120ms`, `--dur-state 220ms`, `--dur-layout 320ms`, `--dur-focal 560ms`; `ease` → `var(--ease-out)`; literales → `--ease-spring` / `--ease-ios`. |
| M8 | **La cascada de entrada de Hoy cuesta 560 ms en cada visita** (0,32 s + 7 índices × 40 ms), también con datos cacheados. | `src/styles/today.css:14-17` · `src/screens/Today.tsx:587-909` | P2 | S | Correr la cascada solo en carga fría (sin `sessionCache`) y recortar a 240 ms + 24 ms por ítem. Mismo criterio en `.learn-enter` y `.session-plan__item`. |
| M9 | **Las cabeceras más tocadas de la app no acusan recibo**: `.blk__head` y `.wk-day__head` sin `:active`; `.ag-row` con `:active` pero sin `transition`. | `src/styles/components.css:3108-3121, 3317-3329, 3095-3098` | P2 | S | `transition` 120 ms + `:active` con fondo `--surface-2` y `scale(0.995)`. |
| M10 | **El camino no se traza al crear la meta**: la `transition` de `stroke-dasharray` no dispara en el primer render, así que GoalCreated aparece ya pintado. | `src/styles/components.css:604-608` · `src/components/Roadmap.tsx:60-65` · `src/screens/GoalCreated.tsx:99-102` | P2 | S | `@keyframes path-draw` 900 ms solo con una prop `intro` desde GoalCreated; hitos con `celebrate-pop` escalonado. |
| M11 | **Toast y cheer desmontan en seco** tras 3,2 s. La píldora activa de BottomNav es un `::before` por pestaña y no puede deslizarse. | `src/app/toast.tsx:45` · `src/hooks/useCheer.ts:16` · `components.css:1740-1749` | P2 | S | Salida de 160 ms con `data-leaving`; un solo indicador absoluto con `translateX(calc(var(--tab) * 100%))`. |
| M12 | **Blendy sale en 700 ms**, más lento de lo que entra, y el detector marca su easing `spring`. Háptico solo en `SessionRun` (`vibrate(30)`); los checks no vibran. | `src/screens/Goals.tsx:63, 106-107` · `src/screens/SessionRun.tsx:252` | P2 | S | Se resuelve al reemplazar Blendy por M3; `vibrate(10)` en TaskItem/HabitRow/AgendaRow. |
| M13 | Propiedades de layout animadas: `.skip-link` (`top`), `.lesson-dots span` (`width`), `.progress__bar` (`width`); `.btn--primary` transiciona de gradiente a color sólido (no interpola, salta); `@media (prefers-reduced-motion: no-preference) {}` vacío. | `components.css:2052, 2726, 1733, 121, 1661-1678, 869-874` | P3 | S | `transform` / `flex-basis` / `scaleX`; borrar el bloque vacío. |

**Tesis de motion para Lógralo** (para el spec): un solo momento focal, "lo lograste", en tres escalas (check 220 ms → etapa 400 ms → meta 560 ms); continuidad solo donde el usuario cambia de escala (meta → detalle, bloque → expandido, semana → día), corte limpio en el resto; feedback obligatorio en todo target táctil (100–150 ms) y en todo plegado (260 ms, `grid-template-rows`); toda salida más rápida que su entrada; ninguna entrada de pantalla por encima de 300 ms; movimiento reducido reduce el desplazamiento, no el color ni el estado.

**Resumen del frente:** 7 P1 · 5 P2 · 1 P3 (43 hallazgos en el anexo D).

---

## 5. Plan priorizado (impacto / coste)

**Ola 1 — un día, todo coste S, sin decisiones de diseño**
1. V1 — el hint "no pude" fuera de "¡Lo lograste!" (`SessionRun.tsx:115`). Corregir en el PR #3 antes de fusionar.
2. I1 — `<IconCheck>` en los cinco checks vacíos.
3. I2 — `IconTrash` en las cinco acciones destructivas.
4. F1 — una sola función de racha en `src/domain/`, consumida por Hoy, Progreso y Perfil.
5. M1 — `animation-iteration-count: 1` y excepciones de feedback en la regla de movimiento reducido.
6. V3 — quitar el cheer duplicado y el "Hoy no pudiste" de SessionCard.
7. F3 — vaciar "Tus hábitos" de Progreso a una línea + enlace.
8. F2 — borrar "Etapa X de Y" en Metas y Progreso.
9. F6 + F9 — chips duplicados de GoalCreated y prop muerta `goalWhy`.
10. M6 — anillo de sesión a 1000 ms lineal.
11. V6 + I9 — borrar `kickoffActions`, `IconSparkles`, `logo-previews.png`; logo a 96 px.

**Ola 2 — medio día cada una, cambian el "feel"**
12. V2 — un solo slot de voz en Hoy.
13. M2 — plegado animado con `grid-template-rows` en bloques, días y `Disclosure`.
14. M4 — salida de los seis sheets; decidir grabber.
15. M7 — tokens de duración y barrido de `ease`.
16. I3 — contraste de glifos de nicho en tema claro (medir en pantalla antes de cerrar).
17. I4 — redibujar `IconToday`.
18. V4 + F4 — plegar la idea de contenido y la agenda de Hoy.
19. V5 — copy honesto en Wizard e Ideas.

**Ola 3 — lo que hace que la app se sienta "top"**
20. M3 — View Transitions reales con elemento compartido meta → detalle (y retirar Blendy).
21. M5 — momento focal: pop en el roadmap al cumplir etapa, overlay de 560 ms al lograr la meta.
22. M10 — el camino se traza al crear la meta.
23. I6 + M11 — pestañas con variante rellena y píldora deslizante en BottomNav.
24. V7 — gamificación en una sola superficie; renombrar "Leyenda".
25. I5 — calibrar el trazo de `base()` y fijar la escala de tamaños.

---

## 6. Límites y notas

- **Sin sesión real**: no hay capturas; los contrastes de I3 son cálculo del auditor sobre los tokens, no medición en pantalla. Verificar con el inspector antes de dar I3 por cerrado.
- **V1 nace en el PR #3** de la serie de la dieta de información. Conviene corregirlo en esa rama antes de fusionar, para no desplegar el defecto.
- **Detector de diseño**: un aviso (easing `spring` en `Goals.tsx:63`), que desaparece con M3/M12.
- **Anexos** con la matriz dato × pantalla, el inventario de 40 voces, los 30 hallazgos de íconos con instrucciones de trazo y los 43 de motion con bocetos CSS: `docs/auditorias/2026-09/`.
