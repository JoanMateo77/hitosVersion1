# Spec — Pase de arreglos de la auditoría de Hito (no-IA)

- **Fecha:** 2026-05-29
- **Fuente:** `AUDITORIA.md` (informe de la auditoría multiagente, 51 agentes)
- **Estado base:** `typecheck` limpio, 41/41 tests pasan

## 1. Objetivo y alcance

Cubrir **todos** los hallazgos no-IA del informe: bugs (`roto`), debilidades (alta/media/baja), accesibilidad transversal, limpieza de código muerto y las **mejoras determinísticas** que recomendaron los agentes. La capa de IA (Gemini/Groq) queda **fuera de alcance** en este pase.

## 2. Decisiones

| Decisión | Elección |
|---|---|
| Profundidad | Todo, incluidas las mejoras determinísticas. IA afuera. |
| Orden | Por severidad: 🔴 alta → 🟡 media → ⚪ baja/limpieza |
| Testing | TDD en dominio (lógica pura); UI/a11y por verificación manual + `tsc` + build + 41 tests verdes |
| Entrega | Directo a `master`, un commit por tema, en orden de severidad |

## 3. Plan de commits (en orden)

**Tier 1 — ALTA**
1. `fix(a11y): base accesible` — `<main>` + skip-link, `aria-current`, `role=alert`/`aria-live` en errores y avisos, labels en formularios, `aria-pressed`/`role=group` en toggles.
2. `fix(data): no romper el plan en silencio` — Review usa `goalsDueForReview`; `catch` que distinguen duplicado vs. error real; rollback optimista en Today; eventos día-completo en "tiempo por meta".
3. `fix(ux): destrabar y no regañar` — "vencida" oculta en metas logradas/archivadas; back contextual en GoalDetail; borrador persistente del Wizard; fila deshabilitada al adoptar; nicho 'otra' seleccionable; recuperar contraseña en Auth.

**Tier 2 — MEDIA**
4. `fix(bugs)` — el resto de bugs de severidad media (ver §C y §B).
5. `feat(domain): mejoras determinísticas` (TDD) — `pickAction` sensible a la etapa + pool de arranque; ampliar `detectTemplate`; (al final) bajar cadencia con mini-migración (ver §D).

**Tier 3 — BAJA + LIMPIEZA**
6. `polish(ux)` — copys, contrastes AA, empty states, segmentación, jerarquía de headings (§E).
7. `chore(cleanup)` — código muerto, estilos inline → clases, type tightening, centralizar NAV/TABS (§F).

> Los bugs `roto` (§B) se reparten entre los commits 2, 3 y 4 según impacto.

## 4. Testing

- **TDD** (test primero) para dominio puro que se toque: `pickAction`, `detectTemplate`, `goalsDueForReview`, helpers de cadencia/fecha. Tests en `src/domain/*.test.ts` siguiendo el patrón existente (Vitest).
- **UI / a11y:** verificación manual en el navegador + `npm run typecheck` + `npm run build` + los 41 tests existentes deben seguir verdes. No se agrega framework de testing de componentes.

## 5. Fuera de alcance

- **Capa de IA (Gemini Flash + Groq) y el proxy.** Las 13 ideas descartadas y las 2 que sobreviven ("bajar prioridad") quedan documentadas en `AUDITORIA.md` para una fase futura.
- Refactors no relacionados con un hallazgo del informe.

## 6. Riesgos y notas

- **Bajar cadencia** requiere agregar un override de cadencia por meta (hoy vive en la plantilla; `Goal` no tiene el campo) → **mini-migración en Supabase** + ajuste de `dailyPlan`. Es el ítem más pesado; va al final del Tier 2 y se avisa antes de tocar el esquema.
- Trabajo directo sobre `master`: cada commit debe dejar `tsc` + tests en verde para poder frenar en cualquier punto.

---

# Inventario completo de hallazgos

## §A · Tier 1 — Debilidades ALTA

### Auth
- [ ] **No existe flujo de 'olvidé mi contraseña' / recuperación. Un usuario que no recuerda su clave queda en un callejón sin salida; contradice la filosofía 'guía no exige'.**
  - Evidencia: `Auth.tsx (toda la pantalla, sólo signin/signup) y auth.ts: grep de reset/forgot/olvid/recuper/magic devuelve vacío; no hay supabase.auth.resetPasswordForEmail en ningún lado.`
  - Arreglo: Agregar un link 'Olvidé mi contraseña' en modo signin que dispare supabase.auth.resetPasswordForEmail(email) y muestre un aviso de 'te mandamos un mail'. Opcionalmente un tercer modo 'reset' o, más barato, magic link / OTP por email.
- [ ] **Los contenedores de error y de aviso no son regiones live: un lector de pantalla no anuncia el fallo de login ni el aviso de éxito cuando aparecen tras el submit.**
  - Evidencia: `Auth.tsx:143-148 — <div className='alert alert--error'> y el div de notice no tienen role='alert' / role='status' ni aria-live. grep de aria-live/role=alert/role=status en Auth.tsx: sin coincidencias.`
  - Arreglo: Poner role='alert' (o aria-live='assertive') en el bloque de error y role='status' (aria-live='polite') en el de notice. Idealmente renderizar siempre el contenedor (aunque vacío) para que el cambio de contenido se anuncie.

### Wizard
- [ ] **Cero persistencia de borrador. Todo el estado del wizard es useState local. Tocar 'No sé qué poner — ver ideas' (navega a /ideas), un refresh, o un back-swipe del navegador descartan título, porqué, fecha y criterio ya tipeados. Volver desde /ideas con 'Escribir mi propia meta' monta un Wizard nuevo en step 0, vacío y sin prefill.**
  - Evidencia: `Wizard.tsx:22-31 (estado local), Wizard.tsx:120 (navigate('/ideas') desde step 0), GoalSuggestions.tsx:98 (vuelve a /meta/nueva sin pasar texto)`
  - Arreglo: Persistir el borrador en sessionStorage o en el state de navegación (navigate state). Pasar el título tipeado como query/state al ir a /ideas y rehidratarlo al volver. Mínimo: confirmar antes de abandonar si hay texto.

### GoalSuggestions
- [ ] **El estado de carga al adoptar no se anuncia ni bloquea visualmente la fila. Solo cambia el desc a 'Creando…', pero el botón OptionRow NO se deshabilita: la única guarda es 'if (adopting === null)' en el onClick. No hay aria-busy ni feedback para lector de pantalla; las otras filas siguen pareciendo cliqueables.**
  - Evidencia: `GoalSuggestions.tsx:84-88 (desc condicional) y :85-87 (guarda en onClick, sin disabled); OptionRow.tsx:12-31 no acepta prop disabled`
  - Arreglo: Pasar disabled a OptionRow (y aplicarlo al <button>), agregar aria-busy en la fila que se está creando, y mostrar un spinner. Deshabilitar todas las filas mientras adopting !== null.
- [ ] **El mensaje de error no se anuncia a tecnologías de asistencia: el div no tiene role='alert' ni aria-live. Un usuario con lector de pantalla que falle al adoptar una meta no recibe ningún aviso.**
  - Evidencia: `GoalSuggestions.tsx:92 (<div className="alert alert--error">{error}</div>, sin role/aria-live)`
  - Arreglo: Agregar role='alert' (o aria-live='assertive') al contenedor de error.
- [ ] **Catch silencioso al crear la primera acción se traga TODOS los errores (red, RLS, permisos), no solo el duplicado que dice el comentario. El usuario llega a /meta/creada creyendo que ya tiene su primera acción del día cuando puede no existir, rompiendo la promesa del plan diario.**
  - Evidencia: `GoalSuggestions.tsx:48-54 (try/catch vacío con comentario 'si ya existía una acción'); createGoalTasks lanza en cualquier error de insert (tasks.ts:75-77)`
  - Arreglo: Distinguir el error de unicidad (código de Postgres) del resto; tragarse solo el duplicado y, ante otros errores, al menos loguear o mostrar un aviso suave en GoalCreated. La meta ya se creó, así que no hace falta abortar, pero no hay que mentir sobre la acción.

### Review
- [ ] **Review recorre TODAS las metas activas, no las que tocan revisar. Filtra solo por status==='active' (Review.tsx:34) e ignora goalsDueForReview() (dailyPlan.ts:192-200), que es la función determinística diseñada para esto (respeta reviewEveryDays/lastReviewedAt). El banner que lanza la pantalla SÍ usa goalsDueForReview (Today.tsx:160,420-440): si dice '2 metas para revisar' pero tenés 7 activas, Review te obliga a pasar por las 7. Es el corazón de 'Sección 6' roto y viola 'guía no exige'.**
  - Evidencia: `src/screens/Review.tsx:34 vs src/domain/dailyPlan.ts:192-200 y src/screens/Today.tsx:160,434`
  - Arreglo: Importar y usar goalsDueForReview(gs) en el .then de listGoals (Review.tsx:32-35), igual que Today. Así el conteo del banner y lo que se revisa coinciden.

### Today
- [ ] **Las mutaciones optimistas no hacen rollback ante error. toggle() pinta la tarea como hecha y editTask() cambia el título antes de await; si setTaskStatus/updateTaskTitle fallan, solo se setea actionError y la UI queda mostrando un estado que NO se persistió. La próxima recarga revierte y el usuario cree que guardó algo que se perdió.**
  - Evidencia: `Today.tsx:211-233 (patchTask optimista en 214 y 229) y 202-209 (withErrorHandling solo setea actionError, nunca revierte)`
  - Arreglo: Guardar el estado previo y revertir en el catch (p. ej. patchTask(task.id, {status: task.status}) al fallar), o recargar la tarea desde el server. Idealmente withErrorHandling recibe un onRollback.

### Goals
- [ ] **Metas logradas o archivadas siguen mostrando el deadline relativo, incluido 'vencida hace N días'. relativeDeadline() se calcula y renderiza sin mirar el status, así que una meta con status='done' y targetDate pasada aparece como 'vencida' — exactamente el regaño que la filosofía 'guía no exige' quiere evitar.**
  - Evidencia: `src/screens/Goals.tsx:106 (const deadline = relativeDeadline(goal.targetDate)) renderizado en :125-129 sin guard de status; relativeDeadline en src/lib/date.ts:49-52 devuelve 'vencida hace…'`
  - Arreglo: Ocultar/transformar el deadline cuando status es 'done' o 'archived' (p.ej. const deadline = (goal.status==='done'||goal.status==='archived') ? null : relativeDeadline(goal.targetDate)), o mostrar la fecha en pasado neutro sin la palabra 'vencida'.

### GoalDetail
- [ ] **El boton Volver esta cableado a /metas, pero GoalDetail se abre desde Today (Today.tsx:348) y Calendar (Calendar.tsx:164) ademas de Goals. Quien entra desde el plan del dia o la agenda queda tirado en otra pantalla, rompiendo su modelo mental de navegacion.**
  - Evidencia: `GoalDetail.tsx:135 y :165 (navigate('/metas')) vs entradas en Today.tsx:348, Calendar.tsx:164`
  - Arreglo: Usar navigate(-1) (history back), o leer un state/from en la navegacion para volver al origen real. Mantener /metas solo como fallback si no hay historial.
- [ ] **El formulario de edicion no asocia labels con inputs: usa <span className="field__label"> sin htmlFor ni id en los campos. Lectores de pantalla no anuncian el label del input y tocar el texto no enfoca el control.**
  - Evidencia: `GoalDetail.tsx:378, 391, 402, 417, 432 (spans) con inputs sin id en :379, :392, :404, :433; estilo .field__label es span en components.css:209`
  - Arreglo: Convertir field__label en <label htmlFor> con id en cada input/textarea, o envolver el control dentro del <label>. Para el grupo de chips de Area, usar <fieldset>/<legend> y role/aria-pressed en los chips.

### Calendar
- [ ] **La UI promete dos veces 'vemos cuánto tiempo le dedicás a la meta por semana' (Hint y field__hint), pero minutesByGoalInRange cuenta SOLO eventos con horario (all_day=false con start y end). El default del editor es allDay=true, así que el camino más común -evento de día completo vinculado a una meta- no suma NADA al tiempo prometido, y nada se lo explica al usuario.**
  - Evidencia: `Calendar.tsx:209-213 y :494 (promesa) vs events.ts:114-136 (filtra all_day=false + start/end no nulos); default allDay=true en Calendar.tsx:371`
  - Arreglo: O contar también los eventos de día completo (con una duración asumida) en el tiempo por meta, o aclarar en el hint que solo cuentan los eventos con horario; idealmente, si el usuario vincula un evento de día completo a una meta, ofrecer pasarlo a 'con horario'.

### Profile
- [ ] **El segmented control ('Una meta'/'Varias metas') y la grilla de chips de nicho del editor no exponen estado a lectores de pantalla: no hay aria-pressed, ni role='group', ni aria-label. Son <button> visualmente toggle pero semánticamente mudos. Inconsistente con el propio ThemeSwitcher de esta misma pantalla, que sí los pone (ThemeSwitcher.tsx:11,17,29,35).**
  - Evidencia: `src/screens/Profile.tsx:122-137 (seg) y 147-158 (chips) — botones sin aria-pressed/role; comparar con ThemeSwitcher.tsx:28-41`
  - Arreglo: Envolver cada grupo en role='group' con aria-label ('¿Cómo querés trabajar?', 'Tu foco principal') y agregar aria-pressed={focusMode===...} / aria-pressed={niche===n.id} a cada botón, igual que ya hace ThemeSwitcher.
- [ ] **El nicho 'otra' (y el caso primaryNiche=null) no es representable en edición: el editor recibe initialNiche = profile.primaryNiche ?? 'otra' (default 'otra'), pero luego filtra 'otra' de los chips. Resultado: un usuario cuyo foco es 'Otra' o que nunca lo fijó abre el editor y NO ve ningún chip seleccionado, y al guardar se le fuerza silenciosamente un nicho real distinto al suyo.**
  - Evidencia: `src/screens/Profile.tsx:51 (initialNiche ?? 'otra') vs 148 (NICHES.filter((n) => n.id !== 'otra'))`
  - Arreglo: O incluir el chip 'Otra' en el editor (no filtrarlo), o, si se decide ocultarlo, mostrar un estado 'sin foco definido' y no permitir un guardado que cambie el valor sin acción explícita del usuario.

### Shell y navegación
- [ ] **Los NavLink no marcan la página activa para tecnología asistiva: solo agregan una clase CSS, nunca aria-current. react-router NO lo pone solo. Un lector de pantalla no distingue la pestaña actual.**
  - Evidencia: `src/components/SideNav.tsx:48 y src/components/BottomNav.tsx:21-23 (className con isActive, sin aria-current). El propio repo conoce el patrón: src/components/Roadmap.tsx:99 usa aria-current.`
  - Arreglo: En el render del NavLink agregar aria-current={isActive ? 'page' : undefined} (la firma de className ya expone isActive).
- [ ] **No hay landmark <main> ni skip-link. El contenido de cada pantalla vive en un <div> genérico, así que no hay forma de saltar la navegación por teclado ni de navegar por regiones.**
  - Evidencia: `src/components/AppShell.tsx:18 (shell__content es <div>). grep en src/ no encuentra ningún <main>, role="main", ni 'skip'.`
  - Arreglo: Convertir shell__content en <main id="main"> y agregar un skip-link al inicio del shell ('Saltar al contenido') visible al enfocar, apuntando a #main.

## §B · Bugs concretos (`roto`)

### Auth
- [ ] El aviso de signup ('revisá tu casilla') queda inalcanzable o se muestra incoherente en el camino feliz sin confirmación de email: el componente Auth se desmonta cuando useAuth detecta la sesión y App.tsx cambia a la app (App.tsx:57-64), así que el notice seteado en Auth.tsx:28 prácticamente no se llega a ver en ese flujo.

### Wizard
- [ ] Si createGoalTasks falla por un motivo real (no duplicado), el catch vacío lo ignora y el usuario aterriza en GoalCreated viendo una 'primera acción' (pickAction recalculada) que nunca se guardó: al ir a Today esa acción no aparece (Wizard.tsx:64-70 + GoalCreated.tsx:41).
- [ ] Borrador no persistente: tocar 'ver ideas', refrescar o gesto de back borra todo lo tipeado sin aviso (Wizard.tsx:22-31, 120).
- [ ] La elección manual de plantilla en step 1 se sobrescribe en silencio si el usuario vuelve a step 0 y avanza de nuevo (Wizard.tsx:41-49).

### GoalCreated
- [ ] Copy: el porqué puede mostrarse como 'Porque porque...' o con concordancia/mayúscula rota porque se antepone 'Porque ' a texto que el placeholder del Wizard ('Porque…') induce a empezar con 'porque' o en minúscula (GoalCreated.tsx:55 + Wizard.tsx:155).
- [ ] Error de red al cargar la meta recién creada redirige en silencio a Today, perdiendo la pantalla de éxito sin ningún mensaje (GoalCreated.tsx:31,38).

### GoalSuggestions
- [ ] El catch vacío en GoalSuggestions.tsx:48-54 puede dejar la meta creada SIN la primera acción del día (ante error de red/RLS) y aun así navegar a /meta/creada como si todo hubiera salido bien: la promesa del plan diario queda rota silenciosamente.
- [ ] El estado 'Creando…' no impide visualmente re-clics en otras filas (no hay disabled en el botón); si bien la lógica lo bloquea con 'if (adopting === null)', la UI sigue invitando a tocar, lo que genera percepción de que no respondió.

### Review
- [ ] El conteo de 'metas para revisar' del banner de Today (goalsDueForReview) NO coincide con lo que Review hace revisar (todas las activas): el usuario ve un número y se le exige otro (Review.tsx:34 vs Today.tsx:434).
- [ ] Completar la última etapa con 'Avancé de etapa' no cierra la meta ni la celebra: el camino queda 'completo' pero la meta sigue 'active' para siempre y no hay forma desde acá de marcarla lograda (Review.tsx:150-152).
- [ ] Una meta ya completada (currentMilestone >= milestones.length) reaparece en la revisión: canAdvance es false (Review.tsx:101) pero como sigue 'active' se vuelve a pedir revisarla indefinidamente cada reviewEveryDays.

### Today
- [ ] Mutaciones optimistas sin rollback: al fallar la red, toggle (Today.tsx:214) y editTask (229) dejan la UI en un estado no persistido; el usuario percibe que guardó y al recargar pierde el cambio.
- [ ] Los botones de evento de la agenda no abren el evento: onClick navega a /calendario sin usar e (Today.tsx:482), así que no llevan al día ni al detalle del evento clickeado.

### Goals
- [ ] Metas con status 'done'/'archived' y targetDate pasada muestran 'vencida hace N días' (Goals.tsx:106+125-129) — informa mal y contradice la filosofía de la app.
- [ ] Una meta 'active' que llegó a currentMilestone === milestones.length muestra 'Camino completo' pero sigue activa y, si la fecha pasó, además 'vencida' — combinación contradictoria (Goals.tsx:111-113,143).

### GoalDetail
- [ ] Back button siempre va a /metas aunque el usuario haya entrado desde Today (Today.tsx:348) o Calendar (Calendar.tsx:164): la navegacion atras lleva a la pantalla equivocada (GoalDetail.tsx:135, :165).
- [ ] Taps rapidos sobre hitos del roadmap disparan multiples setGoalMilestone concurrentes sin guard de 'updating' (GoalDetail.tsx:211): condicion de carrera, el ultimo en resolver pisa al resto.
- [ ] Inputs del editor sin label programatico (GoalDetail.tsx:378-443): para usuarios de lector de pantalla el formulario es practicamente inutilizable.

### Calendar
- [ ] El tiempo por meta NO refleja eventos de día completo aunque estén vinculados; como el editor crea eventos de día completo por defecto (Calendar.tsx:371), vincular un evento de día completo a una meta da toast '+ a la meta' pero la meta sigue mostrando 0 min esa semana (events.ts:114-136 + GoalDetail.tsx:49-54)
- [ ] Un evento con fin anterior al inicio se guarda sin error y aporta 0 minutos en silencio al conteo semanal (Calendar.tsx:391 sin validar fin; events.ts:133 descarta d<=0)

### Profile
- [ ] primaryNiche='otra' o null no es seleccionable en el editor: abre sin chip activo y un Guardar fuerza un nicho distinto al real (Profile.tsx:51 + 148)
- [ ] El fallo de signOut no produce ningún mensaje: el botón simplemente vuelve a 'Cerrar sesión' como si nada (Profile.tsx:26-28)

### Shell y navegación
- [ ] Comentario en base.css:139-141 promete que sidebar y topbar tienen view-transition-name 'así no parpadean'; no existe ninguno en el CSS (grep 0 resultados), por lo que las barras fijas se desvanecen en cada cambio de ruta con @view-transition navigation:auto.
- [ ] Pluralización rota / código muerto en SideNav.tsx:37: {days === 1 ? 'en Hito' : 'en Hito'} — ambas ramas son idénticas, el ternario no hace nada ('Día 1 en Hito' nunca difiere). Era intención de pluralizar y quedó como no-op.

## §C · Tier 2 — Debilidades MEDIA

### Auth
- [ ] **El aviso de éxito usa color de texto = --success sobre fondo --success-soft (mismo color al 14% de opacidad). En tema neón el contraste es muy bajo (texto #34f5c5 sobre rgba(52,245,197,0.14)), por debajo de WCAG AA.**
  - Evidencia: `Auth.tsx:144-147 inline style {background: var(--success-soft), color: var(--success)}; tokens neón: --success #34f5c5 y --success-soft rgba(52,245,197,0.14) (tokens.css:146-147).`
  - Arreglo: Crear una clase .alert--success en components.css (espejo de .alert--error, con borde y un color de texto con contraste real) y usarla en vez del inline style; verificar contraste >=4.5:1 en los 3 temas.
- [ ] **El copy de signup contradice el comportamiento real cuando la confirmación de email está desactivada (el caso que MEMORY indica como deseado): se muestra 'Si te pedimos confirmar el email, revisá tu casilla' aunque el login sea inmediato, justo antes de que useAuth meta al usuario en la app.**
  - Evidencia: `Auth.tsx:24-28; el comentario admite la doble condición pero igual setea el notice siempre. En el flujo sin confirmación, App.tsx:57-64 reemplaza <Auth/> por la app, dejando el aviso a medio mostrar.`
  - Arreglo: Inspeccionar la respuesta de signUp (data.session != null => login inmediato, no mostrar aviso; data.session == null => sí mostrar el aviso de confirmar email). Hacer que signUp en auth.ts devuelva esa señal en lugar de void.
- [ ] **Errores no contemplados por translateAuthError caen al mensaje crudo de Supabase en inglés (rate limit 'For security purposes, you can only request this after…', errores de red, '5xx').**
  - Evidencia: `auth.ts:12 (return message) y Auth.tsx:33 muestra err.message tal cual. No hay rama para throttle/red.`
  - Arreglo: Agregar ramas para 'for security purposes'/'rate'/'too many requests' (-> 'Demasiados intentos, esperá un momento') y un fallback genérico en español para cualquier mensaje no reconocido en vez de devolver el inglés.

### Onboarding
- [ ] **El paso de foco no muestra ni conserva la selección. Ambas OptionRow tienen selected={false} hardcodeado y chooseFocus avanza de inmediato (setStep('niche')), así que el usuario nunca ve confirmada su elección; si toca Volver (línea 95) el paso de foco aparece vacío aunque focusMode siga en estado.**
  - Evidencia: `src/screens/Onboarding.tsx:80,87,28-31`
  - Arreglo: Pasar selected={focusMode==='single'} / selected={focusMode==='multi'} y, al volver, reflejar la elección. Idealmente no auto-avanzar: marcar y mostrar un botón Continuar, o al menos resaltar la opción elegida un instante.
- [ ] **El stepper miente sobre el progreso. En el paso niche el primer dot pasa a --done y el segundo a --active, pero la entrevista 'ayudame a descubrirlo' son 3 preguntas extra sin ningún indicador; durante la entrevista el stepper sigue mostrando 'paso 2' fijo, sin sensación de avance.**
  - Evidencia: `src/screens/Onboarding.tsx:161-168 y 147-156`
  - Arreglo: O bien mostrar progreso dentro de la entrevista (ya hay 'Pregunta X de Y' en línea 187, pero el stepper global lo ignora), o reemplazar el stepper por uno que contemple el sub-flujo. Mínimo: marcar aria-hidden en el stepper decorativo.

### Wizard
- [ ] **La auto-detección de plantilla pisa la elección manual del usuario. next() corre detectTemplate SOLO en step 0, pero si el usuario eligió a mano una plantilla en step 1, vuelve a step 0 y avanza de nuevo, su elección se sobrescribe en silencio (también el área).**
  - Evidencia: `Wizard.tsx:41-49 (next() reescribe templateKey/area cada vez que sale de step 0)`
  - Arreglo: Detectar solo si el usuario no tocó la plantilla todavía (flag 'templateTouched'), o re-detectar únicamente cuando el título efectivamente cambió respecto al último valor detectado.
- [ ] **Errores crudos de backend llegan a la UI. Se muestra err.message verbatim, así que un fallo de Supabase/Postgres aparece como texto técnico en inglés (p. ej. 'value too long for type character varying(200)'), rompiendo el tono rioplatense y filtrando detalles de esquema.**
  - Evidencia: `Wizard.tsx:73-75 (setError(err instanceof Error ? err.message : ...))`
  - Arreglo: Mapear errores a un mensaje genérico en voseo ('No pudimos crear tu meta. Probá de nuevo en un momento.') y loguear el detalle aparte; nunca exponer err.message directo.
- [ ] **Stepper sin semántica accesible y foco que no se mueve al cambiar de paso. Los dots son spans decorativos sin aria ni texto 'Paso N de 6'. Cada paso renderiza su propio <h1> pero al pulsar 'Continuar' no se mueve el foco al nuevo título, así que un lector de pantalla no anuncia que cambió la pregunta.**
  - Evidencia: `Wizard.tsx:88-95 (stepper sin aria), Wizard.tsx:257 (h1 por paso), Wizard.tsx:234-240 (botón Continuar no gestiona foco)`
  - Arreglo: Agregar role/aria-label al progreso (o un texto visualmente oculto 'Paso 2 de 6'), y mover el foco al <h1> del paso (ref + focus en cambio de step) o usar aria-live para anunciar la nueva pregunta.
- [ ] **Inputs sin <label> asociado programáticamente. El título visible es el <h1> del Question, pero no está vinculado al control (sin htmlFor/aria-labelledby); los inputs dependen del placeholder. El grupo de chips de área y el date input tampoco tienen label de grupo (fieldset/legend).**
  - Evidencia: `Wizard.tsx:101-115 (input título), Wizard.tsx:152-161 (textarea porqué), Wizard.tsx:186-201 (chips de área sin fieldset)`
  - Arreglo: Asociar el h1 vía aria-labelledby al input de cada paso (o usar <label>), y envolver los chips en fieldset/legend o agregar role='radiogroup' con aria-label.
- [ ] **El alta de la primera acción traga TODOS los errores, no solo duplicados. El try/catch interno descarta cualquier fallo (red, RLS), pero igual navega a GoalCreated, que re-deriva pickAction y muestra una acción que quizá nunca se persistió: Today no la tendrá. Inconsistencia silenciosa.**
  - Evidencia: `Wizard.tsx:64-70 (catch vacío), GoalCreated.tsx:41 (recalcula pickAction para mostrar)`
  - Arreglo: Distinguir el caso duplicado del resto; ante fallo real, reintentar o avisar. Mejor: que GoalCreated lea la tarea realmente persistida en vez de recalcularla, para que lo mostrado == lo guardado.

### GoalCreated
- [ ] **Bug de copy: se renderiza 'Porque {goal.why}', pero el placeholder del Wizard es 'Porque…' (Wizard.tsx:155), induciendo al usuario a escribir 'porque quiero...' o solo 'quiero...'. Resultado real: 'Porque porque quiero estar sano' (duplicado) o mayúscula/concordancia rota. No hay normalización.**
  - Evidencia: `GoalCreated.tsx:55 (`Porque {goal.why}`) vs Wizard.tsx:155 (placeholder `"Porque…"`)`
  - Arreglo: Mostrar el porqué sin prefijo forzado (ej. comilla tipográfica o cursiva del texto tal cual), o normalizar quitando un 'porque' inicial; idealmente unificar: si el placeholder ya dice 'Porque…', no volver a anteponerlo.
- [ ] **Es EL momento de celebración del producto y no hay ninguna micro-celebración: el ícono IconCelebrate es estático (sin animación de entrada) y no se dispara useCheer ni confetti, pese a que el hook existe y se usa en Today para logros menores (marcar 1 tarea).**
  - Evidencia: `GoalCreated.tsx:50 (IconCelebrate estático, sin clase de animación) y ausencia de import de useCheer; el hook se usa en Today.tsx:64,219-220 para eventos menores`
  - Arreglo: Añadir una animación de entrada sutil al header/ícono (respetando prefers-reduced-motion) y/o un cheer efímero. No hace falta confetti pesado; basta un 'pop' del ícono y fade-in escalonado del stack.
- [ ] **Estado de error de carga rebota a Today sin avisar. Si getGoal lanza (red caída, RLS), el catch solo hace setLoading(false); como goal sigue null, se ejecuta <Navigate to='/'>. El usuario que ACABA de crear una meta termina en Today sin explicación de por qué 'desapareció' su pantalla de éxito.**
  - Evidencia: `GoalCreated.tsx:31 (`.catch(() => active && setLoading(false))`) + GoalCreated.tsx:38 (`if (!goal) return <Navigate to="/" replace />`)`
  - Arreglo: Distinguir error de 'no encontrada': guardar un estado de error y renderizar <LoadingScreen error=...> (que ya soporta error + Reintentar, LoadingScreen.tsx:10-15) en vez de redirigir en silencio. Reservar el Navigate solo para goal===null real.
- [ ] **Sin manejo de foco al montar. Tras navegar desde el Wizard, el foco queda en el body; un usuario de teclado/lector de pantalla no recibe señal de que cambió de pantalla ni dónde está. El h1 no es focusable y no hay aria-live para anunciar '¡Meta creada!'.**
  - Evidencia: `GoalCreated.tsx:43-56 (header sin tabIndex/ref/focus; ningún role='status' ni aria-live en la celebración)`
  - Arreglo: Enfocar el h1 (tabIndex={-1} + ref.focus() en efecto) o envolver el título en un region con aria-live='polite' para anunciar el éxito. Bajo costo, mejora real de a11y.

### GoalSuggestions
- [ ] **El parámetro ?area= se castea a NicheId sin validar. Con ?area=basura cae silenciosamente en 'otra': el header muestra 'tu foco 🎯 Otra' y sugerencias de 'otra' aunque el usuario venga de una meta real. Estado incorrecto silencioso, no un error visible.**
  - Evidencia: `GoalSuggestions.tsx:26-27 (params.get('area') as NicheId); el fallback que lo enmascara está en recommendations.ts:55 (?? NICHE_GOAL_SUGGESTIONS.otra)`
  - Arreglo: Validar el área contra el catálogo de NICHES antes de usarla; si no es válida, ignorarla y caer al profile.primaryNiche.
- [ ] **Varios nichos ofrecen pocas o una sola idea, contradiciendo el subtítulo y el objetivo de '2-3 metas concretas'. 'relaciones' y 'creatividad' tienen 2; 'otra' tiene 1 — y 'otra' es justamente el fallback por defecto (profile.primaryNiche ?? 'otra'), o sea el caso del usuario más perdido recibe la peor experiencia (una única idea genérica).**
  - Evidencia: `recommendations.ts:36-39 (relaciones, 2), :40-43 (creatividad, 2), :49-51 (otra, 1); fallback a 'otra' en GoalSuggestions.tsx:27`
  - Arreglo: Completar a 3 ideas por nicho, en especial 'otra'. Para 'otra' se pueden ofrecer 3 metas plantilla transversales (un hábito, un proyecto, aprender algo).

### Review
- [ ] **La acción 'Avancé de etapa' es incoherente con GoalDetail y se traga el fin del camino. Hace setGoalMilestone(goal.id, stage+1) y siempre dice 'Etapa cumplida. Bien ahí.' (Review.tsx:150-152). En la última etapa eso completa el camino, pero acá no muestra 'Recorriste todo el camino' (como GoalDetail.tsx:112) ni ofrece marcar la meta como lograda ('done'). El usuario completa su meta y la app no lo reconoce ni le cierra el ciclo.**
  - Evidencia: `src/screens/Review.tsx:144-158 vs src/screens/GoalDetail.tsx:110-113,283`
  - Arreglo: Diferenciar el mensaje cuando stage+1 >= milestones.length ('Recorriste todo el camino') y, en ese caso, ofrecer una acción 'Marcar meta como lograda' que llame setGoalStatus(goal.id,'done'), cerrando el ciclo como en GoalDetail.
- [ ] **Estados terminales inconsistentes: la pantalla de 'no hay metas' (Review.tsx:63-76) tiene Header con botón Salir pero NO tiene CTA 'Volver a hoy', mientras la pantalla de fin de revisión (Review.tsx:78-96) SÍ tiene el botón grande pero NO tiene Header. El usuario en el caso vacío queda solo con una flechita chica arriba como salida.**
  - Evidencia: `src/screens/Review.tsx:63-76 (sin CTA) vs 78-96 (sin Header)`
  - Arreglo: Unificar: ambos estados terminales deben ofrecer el mismo botón claro 'Volver a hoy'. Agregar el CTA al estado vacío.
- [ ] **El error de guardado no se anuncia a lectores de pantalla. El banner usa class 'alert alert--error' (Review.tsx:128) sin role='alert' ni aria-live. Al fallar markGoalReviewed/setGoalMilestone/setGoalStatus, un usuario con lector de pantalla no se entera; el resto de la app sí usa role/aria-live (toast.tsx:61, LoadingScreen.tsx:18).**
  - Evidencia: `src/screens/Review.tsx:128`
  - Arreglo: Agregar role='alert' (o aria-live='assertive') al div del error para que se anuncie al aparecer.

### Today
- [ ] **El mensaje de error de acción no se anuncia a lectores de pantalla: el bloque .alert--error no tiene role='alert' ni aria-live, a diferencia del cheer que sí lo tiene. Un usuario con lector no se entera de que su cambio falló.**
  - Evidencia: `Today.tsx:545-549 (sin aria-live) vs 497 (cheer con role='status' aria-live='polite')`
  - Arreglo: Agregar role='alert' (o aria-live='assertive') al div .alert--error.
- [ ] **Copys en tuteo dentro de una app estrictamente rioplatense/voseo. 'Vuelve si toca...' y 'Mañana vuelve si toca...' rompen la consistencia que el resto del archivo sí respeta (Sumá, Elegí, tenés, ponés).**
  - Evidencia: `Today.tsx:245 ('Saltada por hoy. Vuelve si toca por frecuencia.') y TaskItem.tsx:34 ('La saltás sólo hoy. Mañana vuelve si toca por frecuencia.')`
  - Arreglo: Cambiar 'Vuelve' por 'Volvé' en ambos lugares.
- [ ] **Los eventos de la agenda de hoy se renderizan como <button> sin aria-label y TODOS navegan a /calendario genérico ignorando el evento. Un lector de pantalla oye solo hora+título sin saber que es accionable ni a dónde va; y abrir el evento no lleva a ese día/evento.**
  - Evidencia: `Today.tsx:481-486 (key={e.id} pero onClick={() => navigate('/calendario')} no usa e; sin aria-label)`
  - Arreglo: Agregar aria-label tipo `Ver "${e.title}" en la agenda` y navegar al día del evento (navigate(`/calendario?d=${e.date}`) o a un detalle).

### Goals
- [ ] **No hay landmark main: el contenido de todas las pantallas (incl. Goals) se monta dentro de un <div className="shell__content"> en vez de <main>. Lectores de pantalla no tienen región principal a la que saltar; el h1 'Tus metas' queda fuera de un main.**
  - Evidencia: `src/components/AppShell.tsx:16-21 (<div className="shell__main"> y <div className="shell__content"><Outlet/></div>, ningún <main>)`
  - Arreglo: Envolver el Outlet en <main id="contenido"> y añadir un skip-link. Es transversal pero impacta esta pantalla.
- [ ] **Toda la tarjeta es un único <button> que concatena emoji + título + tag de nicho + emoji de nicho + deadline + conteo + barra como nombre accesible. El usuario de lector de pantalla escucha algo como '💪 Correr 5k 💪 Salud y cuerpo faltan 8 días · 3 acciones hechas Etapa 2 de 4', verboso y con emojis leídos en voz alta.**
  - Evidencia: `src/screens/Goals.tsx:115-149 (el <button> envuelve goal-card__top, tags, deadline, count y progress sin aria-label)`
  - Arreglo: Dar nombre accesible limpio al botón: aria-label={`Ver meta: ${goal.title}`} y aria-hidden en los emojis decorativos (template.emoji, niche.emoji), dejando el resto como detalle visual.
- [ ] **Texto secundario en .faint queda por debajo del contraste AA. --text-faint #7e8773 sobre --surface #fbf8f1 da 3.54:1 (3.66:1 en tema oscuro), pero se usa para info de 12px con significado: deadline, 'N acciones hechas' y 'Etapa X de N'. AA pide 4.5:1 para texto chico.**
  - Evidencia: `src/screens/Goals.tsx:126,131,142 usan clase .faint+.tiny; tokens en src/styles/tokens.css:95 (--text-faint #7e8773) y :87 (--surface #fbf8f1); .faint en components.css:90-92, .tiny=12px en tokens.css:33`
  - Arreglo: Oscurecer --text-faint hasta ≥4.5:1 (o usar --text-muted, que ya da 6.9:1) para estos textos, o subir su tamaño/peso. No es decorativo: comunica plazo y progreso.
- [ ] **No hay segmentación ni filtro: las 4 categorías de estado se vuelcan en una sola lista. Metas 'archived' y 'done' siguen siendo tarjetas-botón a tamaño completo, solo atenuadas a opacity 0.7, mezcladas con las activas. A medida que el usuario acumula metas terminadas, las activas (lo accionable) quedan empujadas hacia abajo, contra el principio de 'una acción clara, no listas infinitas'.**
  - Evidencia: `src/screens/Goals.tsx:79-90 (lista única) y :108,115 (dimmed = done/archived → solo opacity 0.7)`
  - Arreglo: Separar visualmente: sección 'Activas' arriba y un acordeón/colapsable 'Terminadas y archivadas' abajo, o un filtro por estado. Mantener lo accionable al alcance inmediato.

### GoalDetail
- [ ] **Riesgo real de solapamiento del roadmap: los nodos se posicionan cada STEP_H=64px pero .roadmap__label-row tiene height fijo 28px y los labels no truncan ni limitan lineas. Hitos largos como 'Definir tu punto de partida (peso, medidas o resistencia actual)' envuelven a 2-3 lineas y chocan con el nodo/label siguiente; ademas el nodo SVG deja de alinear con el texto envuelto.**
  - Evidencia: `Roadmap.tsx:9 (STEP_H=64), components.css:576-582 (height:28px), texto largo en templates.ts:23 y carrera.ts milestones :103-109`
  - Arreglo: Hacer la altura de cada fila dependiente del contenido (layout en flujo, no absolute) o aumentar STEP_H y alinear el nodo SVG al centro vertical real del label; alternativamente limitar el alto con line-clamp y title para el texto completo.
- [ ] **Carrera en el roadmap: onSelect queda activo siempre que la meta este activa, sin deshabilitarse durante 'updating'. Taps rapidos en distintos hitos disparan varios setGoalMilestone concurrentes y el ultimo en resolver gana, pudiendo dejar un estado inconsistente. El boton 'Completé esta etapa' si se deshabilita, pero los nodos no.**
  - Evidencia: `GoalDetail.tsx:211 (onSelect solo chequea status, no updating) vs :226 (boton con disabled={updating})`
  - Arreglo: Pasar a Roadmap un prop disabled/busy y cortar onSelect mientras updating; idealmente actualizacion optimista con rollback en error.
- [ ] **El error de actualizacion (status/milestone) se renderiza solo en la columna lateral, lejos de la accion que fallo. En escritorio, fallar al marcar un hito en la columna izquierda muestra el error abajo a la derecha, debajo del card de info: facil de no verlo.**
  - Evidencia: `GoalDetail.tsx:278 (alert error en detail-grid__side) mientras la accion de hitos vive en detail-grid__main :220-240`
  - Arreglo: Mostrar el error inline junto a la accion que lo origino (cerca del roadmap y de los botones de estado), o usar un toast de error consistente con el resto de la pantalla.

### Calendar
- [ ] **No hay validación de rango horario: canSave solo exige startTime cuando no es de día completo; endTime puede quedar vacío o ser anterior a startTime. minutesBetween devuelve negativo y se descarta en silencio, contribuyendo 0 al conteo semanal sin avisar.**
  - Evidencia: `Calendar.tsx:391 (canSave no valida fin) y :470-487 (inputs time sin chequeo); events.ts:104-108 y :133 (d>0 descarta el inválido sin feedback)`
  - Arreglo: Validar endTime > startTime antes de guardar y mostrar un error inline en el editor; o auto-corregir el fin si es menor que el inicio.
- [ ] **Editar la fecha de un evento a un día fuera del rango [from,to] cargado deja el evento en el estado local igual. En vistas día/semana, mover un evento a otra semana lo deja como 'fantasma' en la lista hasta que se navega y se refetchea.**
  - Evidencia: `Calendar.tsx:123-143 (submitEvent hace setEvents map/append sin filtrar por rango visible); el rango se recalcula en :54-58 pero el evento ya está en memoria`
  - Arreglo: Tras actualizar, descartar del estado los eventos cuya date caiga fuera de [from,to], o refetchear el rango actual tras mutaciones.
- [ ] **Los segmented controls (selector de vista y toggle Todo el día/Con horario) no exponen su estado a tecnologías de asistencia: solo el color indica el activo, sin aria-pressed ni role. Un usuario de lector de pantalla no sabe cuál está seleccionado.**
  - Evidencia: `Calendar.tsx:189-197 (vista) y :455-468 (allDay); el estado activo es solo CSS .seg__btn--active (components.css:829-832)`
  - Arreglo: Agregar aria-pressed={view===v} a cada botón del segmented (y al toggle de allDay), o usar role=radiogroup/radio con aria-checked.

### Profile
- [ ] **No hay detección de cambios (dirty check): el botón 'Guardar cambios' siempre llama a updateProfilePrefs y hace un UPDATE en Supabase aunque el usuario no haya tocado nada. Escritura de red y re-set de perfil innecesarios; además 'Guardar' nunca está deshabilitado por 'no hay cambios'.**
  - Evidencia: `src/screens/Profile.tsx:106-116 y 164 — save() no compara contra initialFocus/initialNiche; el botón solo se deshabilita por 'saving'`
  - Arreglo: Calcular dirty = focusMode!==initialFocus || niche!==initialNiche; deshabilitar 'Guardar' si !dirty (o cerrar el editor sin llamar al servicio cuando no cambió nada).
- [ ] **El error de 'Cerrar sesión' se traga sin feedback: si signOut() falla, el catch solo hace setSigningOut(false) y el usuario ve el botón volver a la normalidad sin ninguna explicación de por qué no pasó nada. Contradice 'el usuario nunca debe quedar pensando y ahora qué'.**
  - Evidencia: `src/screens/Profile.tsx:21-29 — catch {} vacío salvo el reset de estado`
  - Arreglo: Mostrar un toast/alert ('No se pudo cerrar sesión, probá de nuevo') en el catch; ya existe alert--error en el editor para reusar el patrón.

### Shell y navegación
- [ ] **Comentario falso + bug de flicker de las barras: base.css afirma que sidebar y topbar tienen view-transition-name propio 'así no parpadean', pero no existe ningún view-transition-name en el CSS. Con @view-transition navigation:auto, todo el root hace cross-fade en cada ruta, por lo que las barras fijas SÍ se desvanecen en cada navegación.**
  - Evidencia: `src/styles/base.css:139-143 (comentario + @view-transition); grep 'view-transition-name' en components.css: 0 resultados.`
  - Arreglo: Asignar view-transition-name a .sidenav/.topbar/.bottomnav (o un contenedor estable) para excluirlas de la transición de root, o corregir el comentario y aceptar el fade. El comentario que miente es deuda peligrosa.
- [ ] **Contraste sub-AA en la navegación inactiva. --text-faint (#7e8773) sobre fondo de barra (#fbf8f1) ronda ~3:1 y se usa para los labels de la bottomnav a 11px, texto pequeño que exige 4.5:1.**
  - Evidencia: `src/styles/components.css:689-690 (.bottomnav__item color var(--text-faint), font-size 11px); token en src/styles/tokens.css:95. Mismo faint a 10px en .sidenav__day (components.css:1420-1422).`
  - Arreglo: Usar --text-muted (#4f5947, ~7:1) para los labels de pestaña inactiva, o subir el tono de --text-faint; el ítem activo ya queda claro por color primary.
- [ ] **ErrorBoundary solo recupera con un full reload y no resetea estado; además solo loggea a consola. Cualquier error de render deja al usuario sin opción de 'volver atrás' y pierde toda la sesión SPA.**
  - Evidencia: `src/components/ErrorBoundary.tsx:18-19 (solo console.error) y :31 (onClick reload). No hay método de reset ni botón 'Volver al inicio'.`
  - Arreglo: Agregar un reset (setState hasError:false) + acción 'Ir a Hoy' además de Recargar; opcionalmente un hook para reportar el error a un endpoint cuando se sume backend.

## §D · Tier 2 — Mejoras determinísticas

- [ ] **`pickAction` sensible a la etapa + pool de arranque.** Hoy `pickAction` (`dailyPlan.ts:72-77`) recibe la meta entera pero solo usa `goal.id` + `templateKey`, ignorando `currentMilestone`/`why`/`successCriteria`. Hacer que la acción dependa del hito actual y agregar un pool de acciones de **arranque** (kickoff) por plantilla para el día 0 / primera etapa. Captura el valor que reclamaban varias "ideas de IA". **TDD.**
- [ ] **Ampliar el diccionario de `detectTemplate`** (`templates.ts:266`). Sumar aliases/sinónimos (oposiciones→académico, marca/emprender→crear_publicar, dejar de fumar→bienestar/salud, MBA→académico, maratón→salud, etc.) para tapar 70-80% de los títulos que hoy caen en `personalizada`. **TDD** (casos del informe como fixtures).
- [ ] **Cerrar/celebrar la meta al completar la última etapa** (coincide con bugs de Review/GoalDetail): al avanzar del último hito, ofrecer marcar la meta como `done` y celebrar, en vez de dejarla `active` para siempre.
- [ ] **Bajar cadencia (replanteo determinístico)** — ⚠️ requiere mini-migración: override de cadencia por meta en `goals` + lectura en `dailyPlan`. Al final del Tier 2; avisar antes de tocar el esquema.

## §E · Tier 3 — Debilidades BAJA

### Auth
- [ ] Sin foco automático en el campo email al cargar la pantalla; el usuario debe hacer clic/tab antes de tipear en una pantalla de propósito único.
- [ ] Sin validación de formato de email en cliente más allá de type='email'; el feedback de 'email inválido' depende de un round-trip a Supabase.

### Onboarding
- [ ] Copy engañoso: el header promete 'Dos preguntas rápidas' pero por el camino de la entrevista son 1 foco + 3 preguntas = 4 toques. Roza la honestidad que pide la filosofía 'guía no exige'.
- [ ] Estado residual del banner de sugerencia y de la selección. suggested no se limpia al volver al paso focus, y chooseFocus no resetea niche/suggested; si el usuario va atrás y cambia de modo, conserva el nicho/banner del intento anterior.
- [ ] La entrevista no anuncia el cambio de pregunta a lectores de pantalla. 'Pregunta X de Y' es texto plano y el h1 cambia sin live region ni manejo de foco, así que con teclado/SR el avance entre preguntas es silencioso.
- [ ] No hay forma de elegir 'Otra' en el onboarding: el selector la filtra (línea 116) y la entrevista nunca la vota, así que un usuario con un foco fuera de la taxonomía queda forzado a una categoría que no es la suya.

### Wizard
- [ ] El textarea del porqué no tiene maxLength y los errores de longitud solo se ven al guardar. Mientras título y criterio limitan a 200 (con corte silencioso, sin contador), el porqué (Wizard.tsx:152) no acota nada; un texto enorme falla recién en createGoal y se muestra como error crudo.
- [ ] 'Volver' desde el paso 0 siempre lleva a / (Today), ignorando de dónde vino el usuario. Si entró desde /metas o desde /ideas, el back lo deja en Today, no en su pantalla anterior.
- [ ] El step 1 lista las 9 plantillas en un scroll plano y la opción auto-seleccionada puede quedar fuera de pantalla. No se ancla ni se hace scrollIntoView de la plantilla detectada, así que el usuario puede no ver que ya hay una elegida.

### GoalCreated
- [ ] 'Empezá hoy con {firstAction}' usa <strong> con font-size 22px inline, pero no es un encabezado semántico ni tiene jerarquía de heading; es el segundo elemento más importante de la pantalla y queda como texto suelto. El kicker 'Empezá hoy con' es la etiqueta real del contenido.
- [ ] La pantalla es alcanzable por URL para CUALQUIER goalId, incluida una meta ya 'done' o 'archived'. En ese caso muestra '¡Meta creada!' y 'Empezá hoy con' para una meta que no está activa — mensaje falso. El flujo normal usa replace:true, pero el back/forward o un link directo lo exponen.
- [ ] No hay forma de volver al detalle/editar desde acá; la única salida es 'Ver mi plan de hoy'. Si el usuario nota un typo en el título o eligió mal la plantilla, no tiene atajo a la meta recién creada (queda solo el camino, no editable acá).

### GoalSuggestions
- [ ] El botón Volver siempre navega a '/' aunque el usuario haya llegado desde GoalDetail vía ?area= ('Ver ideas para tu próxima meta'). Romper la expectativa de 'volver' tras cumplir una meta tira al usuario al Today en vez de a la meta que acaba de completar.
- [ ] No hay manejo de 'lista vacía' de sugerencias. Hoy ningún nicho está vacío, pero el render asume que suggestions.map siempre produce filas; si en el futuro un nicho queda sin seeds, la pantalla muestra solo el botón de escribir meta sin explicación.

### Review
- [ ] Sin feedback de 'guardando' más allá de disabled. act() pone working=true y deshabilita botones (Review.tsx:47-56,133,146,160) pero no hay spinner, texto 'Guardando…' ni aria-busy. En red lenta los tres botones quedan grises y la pantalla parece congelada.
- [ ] Tras revisar una meta no se refresca su estado local; solo avanza el índice (Review.tsx:51). En sí no rompe el flujo lineal, pero el array goals queda con lastReviewedAt/currentMilestone viejos. Si en el futuro se permite volver atrás o se recalcula 'due' en pantalla, mostraría datos obsoletos.
- [ ] El emoji decorativo del título no está aislado de lectores de pantalla. '{template.emoji} {goal.title}' en el h1 (Review.tsx:113-115) hace que el lector lea el nombre del emoji antes del título; debería ser aria-hidden, como ya se hace con los íconos SVG.

### Today
- [ ] Inconsistencia entre el modo enfocado y los copys de 'proponé vos'. En single mode planningGoals devuelve UNA sola meta (dailyPlan.ts:181-184), pero el aviso al no faltar nada dice 'una acción para cada meta hoy' y el empty state habla de pedir 'una propuesta' como si cubriera todas. Confunde sobre qué hace el botón.
- [ ] Apilamiento de tarjetas de aviso por encima del plan: foco semanal + revisión + meta olvidada + agenda + aviso single-mode + cheer pueden mostrarse todos juntos antes de la lista de tareas, empujando 'lo esencial' (el plan) abajo del fold en móvil. Contradice 'una acción por meta, no listas infinitas' y 'lo primero es el plan'.
- [ ] profile (objeto de contexto) es dependencia del useEffect de carga; si setProfile genera una nueva referencia (ajustes, onboarding), se re-ejecuta todo el init y se vuelven a fetchear goals/tasks/events aunque nada relevante cambió. genGuard evita re-crear tareas, pero no el refetch.

### Goals
- [ ] El badge de estado y el tag de categoría usan la misma clase .tag, sin diferenciación visual. 'Pausada' se ve idéntico a '💪 Salud y cuerpo'; el usuario no distingue de un vistazo estado vs. área.
- [ ] El estado de error usa LoadingScreen a pantalla completa cuyo botón 'Reintentar' hace window.location.reload(), un recargón duro que tira todo el estado SPA. useAsyncData ya expone reload() (reintento suave) pero acá no se usa.
- [ ] Dos nociones de progreso conviven en la misma tarjeta sin jerarquía: 'N acciones hechas' (conteo de microacciones de toda la vida) y 'Etapa X de N' (hito del roadmap). Son métricas distintas y juntas pueden confundir qué tan avanzada está la meta.

### GoalDetail
- [ ] Contraste limite: textos guia usan .faint (--text-faint #7e8773 sobre fondo paper) a 12px (.tiny). Combinacion borderline para WCAG AA en texto chico; el link 'agenda' embebido depende solo de color para distinguirse.
- [ ] Marcar 'lograda' no auto-completa el camino: si currentMilestone < total, el roadmap queda visualmente a medias aunque la meta este lograda. Pequena incoherencia entre el estado y la narrativa del progreso.
- [ ] Empty-state de meta inexistente no ofrece recuperacion mas alla de la flecha de volver; sin CTA claro.

### Calendar
- [ ] El grabber del sheet sugiere fuertemente que se puede arrastrar para cerrar, pero no hay ningún handler de drag: solo cierra por backdrop, Escape o la X. Affordance que miente.
- [ ] En vista semana, el título del header usa week[0] (lunes), así que una semana a caballo de dos meses se rotula con un solo mes (ej.: semana 30-jun a 6-jul aparece como 'Junio de 2026').
- [ ] No hay feedback de carga al navegar entre rangos: 'ready' se setea true una sola vez y nunca vuelve a false, así que al cambiar de mes/semana se ven los eventos viejos sin spinner ni skeleton hasta que resuelve el fetch.
- [ ] El estado vacío de un día ('Sin eventos.') no invita a la acción, en tensión con la filosofía 'guía no exige': hay un + arriba pero el texto no orienta.

### Profile
- [ ] Sin guarda de cambios sin guardar: al estar editando, el editor no avisa si se descartan cambios. 'Cancelar' (Profile.tsx:167) descarta de inmediato sin confirmación. Menor en esta pantalla (pocos campos, baja consecuencia), pero el editing vive en estado local y un cambio de ruta lo pierde sin aviso.
- [ ] Riesgo de contraste en textos auxiliares: field__hint usa --text-faint (el token más tenue) para los hints explicativos, y la línea de donación usa 'faint tiny center'. En tamaños chicos puede no llegar a 4.5:1, sobre todo en tema 'paper warm'/neón.

### Shell y navegación
- [ ] El error de carga de perfil expone el mensaje crudo de Supabase al usuario final dentro de LoadingScreen, y la única salida es recargar.
- [ ] Dos <nav> con la misma aria-label 'Navegación principal'. Aunque solo uno se ve por viewport, ambos están en el DOM siempre y comparten nombre accesible, lo que confunde la navegación por regiones.
- [ ] ConfigNeeded usa <h2> como encabezado de mayor jerarquía de la pantalla; no hay <h1>, rompiendo el orden de headings.

## §F · Tier 3 — Limpieza (`innecesario`)

### Auth
- [ ] El SVG decorativo del 'camino' (Auth.tsx:53-72, ~20 líneas inline) es puro adorno y sólo se ve expresivo en desktop; podría extraerse a un componente o a un asset para no ensuciar la pantalla, aunque no es grave.
- [ ] Estilos inline dispersos en el JSX (Auth.tsx:76, 89, 92-95, 98, 145, 155) que deberían vivir en CSS (especialmente el del notice, que además causa el problema de contraste); mezcla de inline + clases hace la pantalla más difícil de mantener.
- [ ] El estado 'notice' agrega complejidad para un mensaje que, en la configuración recomendada (confirm-email OFF), casi nunca se muestra; si se confirma que el proyecto va sin confirmación de email, el flujo de notice es código que aporta poco.

### Onboarding
- [ ] updateProfilePrefs (profile.ts:70-82) es casi idéntico a completeOnboarding salvo onboarded_at; no lo usa esta pantalla y duplica el update de profiles. Se podría unificar con un flag, aunque la separación semántica es defendible.
- [ ] Stepper de 2 dots para un flujo de 2-4 pasos aporta poco valor real frente al ruido visual y al riesgo de mentir sobre el progreso (ver debilidad); en un onboarding tan corto casi sobra.

### Wizard
- [ ] Cadence 'weekly' está en el tipo y en dailyPlan (actionsPerWeek/isDueToday, dailyPlan.ts:48,63) pero NINGUNA plantilla la usa: rama muerta arrastrada en templates.ts.
- [ ] El constante STEPS=6 con comentario '5 preguntas + el tipo' es correcto, pero la lógica isLast/canContinue mezcla índices mágicos (step===0, step===5) que serían más claros con un arreglo de pasos declarativo; hoy hay condicionales sueltos repartidos (Wizard.tsx:79-80, 99-229).
- [ ] enterKeyHint='enter' en el textarea del porqué (Wizard.tsx:160) no aporta nada (un textarea ya inserta salto de línea); ruido de props.
- [ ] ReviewCard recibe targetDate/why/criteria y vuelve a hacer .trim() de why y criteria (Wizard.tsx:281-282) que ya se re-trimean en submit: doble trabajo menor, podría normalizarse una sola vez en el estado.

### GoalCreated
- [ ] La importación de LoadingScreen se usa solo para el spinner pero nunca para su modo error, justamente el caso que falta cablear (GoalCreated.tsx:8,37) — no es código muerto, pero evidencia capacidad desaprovechada.
- [ ] fontSize inline en el strong de la focus-card (GoalCreated.tsx:67) duplica intención de la regla .focus-card strong ya existente (components.css:490); estilar desde TSX cuando ya hay clase es redundante.

### GoalSuggestions
- [ ] El fallback '?? NICHE_GOAL_SUGGESTIONS.otra' en suggestionsForNiche (recommendations.ts:55) es código muerto en la práctica: NICHE_GOAL_SUGGESTIONS es Record<NicheId, ...>, así que toda key válida resuelve. Solo se activa con casts inválidos (el ?area= sin validar) y, peor, enmascara ese bug en vez de exponerlo.
- [ ] El comentario extenso repetido sobre 'sección 5.1 del documento' aparece casi idéntico en GoalSuggestions.tsx:15-19 y recommendations.ts:9-14; basta dejarlo en un solo lugar.
- [ ] El estilo inline marginTop/var(--s4) se repite en header (línea 68) y en el botón ghost (línea 97); convendría una clase en vez de inline styles dispersos.

### Review
- [ ] Header local (Review.tsx:176-185) es casi idéntico al de otras pantallas de flujo (Wizard/GoalCreated comparten el patrón row--between + iconbtn Salir + label): candidato a un componente FlowHeader compartido en vez de redefinirlo por pantalla.
- [ ] stage = Math.min(goal.currentMilestone, milestones.length) (Review.tsx:100) repite literalmente la lógica de GoalDetail.tsx:210; convendría centralizar 'stage clamped' en un helper de dominio para no duplicarla en cada pantalla que pinta el Roadmap.

### Today
- [ ] Estilización inline repetitiva y voluminosa (style={{...}} en casi todos los bloques: 331, 345-347, 350, 423-428, 491, 559...) que duplica responsabilidades del CSS y ensucia el JSX; convendría llevarlo a clases utilitarias.
- [ ] Dos canales de feedback efímero solapados: useCheer (cheer in-place) + useToast para acciones similares (p. ej. removeTask usa toast, pero los hitos del día usan cheer). Mantener ambos agrega complejidad mental sin un criterio claro de cuándo usar cada uno.
- [ ] actionsPerWeek/focusTarget calculan el denominador del progreso semanal asumiendo que la cadencia equivale a 'acciones objetivo', pero el contador (countDoneByGoalInRange) cuenta TODAS las done de la meta en la semana, incluidas tareas user-added o extra; el 'X/Y' puede pasar el target y se capea con Math.min (361) — el cap esconde que numerador y denominador miden cosas distintas.

### Goals
- [ ] reload del hook useAsyncData no se aprovecha en esta pantalla; en su lugar se delega a window.location.reload() (Goals.tsx:32,47 vs useAsyncData.ts:42).
- [ ] Doble ordenamiento: el servicio ya hace order('created_at', desc) (goals.ts:54) y la pantalla vuelve a copiar+ordenar por status en cada render sin useMemo (Goals.tsx:49-51); el sort por status alcanza, el spread/recompute por render es trabajo redundante.
- [ ] STATUS_ORDER define posición para 'done' y 'archived' (Goals.tsx:18-19) pero esas metas no necesitan ordenarse entre las activas si se segmentaran en su propia sección; hoy solo sirven para empujarlas al final dentro de la misma lista.
- [ ] Los botones del header/empty/tarjeta no llevan type="button" (Goals.tsx:57,70,73,115); inofensivo fuera de un form, pero es ruido inconsistente respecto a otros componentes que sí lo ponen (TaskItem.tsx:65,98).

### GoalDetail
- [ ] CSS legacy del viejo roadmap dejado como no-op: .roadmap__step, .roadmap__node, .roadmap__hit y variantes (components.css:614-660) son codigo muerto.
- [ ] Doble hint redundante para lo mismo: el componente Hint 'Tocá un hito…' (GoalDetail.tsx:215) y el <p> permanente 'Tocá un hito para ajustar dónde estás.' (GoalDetail.tsx:238) repiten el mensaje; el segundo es clutter fijo.
- [ ] El bloque focus-card 'Recorriste todo el camino' (GoalDetail.tsx:231-237) duplica el tag 'Camino completo' (GoalDetail.tsx:203-204) y el mensaje del toast: tres lugares dicen lo mismo.

### Calendar
- [ ] compareEvents está exportado (domain/calendar.ts:34) pero solo se usa internamente en groupByDate; si no se testea aparte, alcanza con dejarlo no exportado
- [ ] deadlinesByDate y eventsByDate se recalculan a nivel de pantalla y además dayProps vuelve a leerlos por día; está bien, pero el grid en vista mes recalcula evs dos veces (en el render de celdas :230 y luego en DaySection del día seleccionado vía dayProps :249) — duplicación menor de lookups

### Profile
- [ ] FOCUS_LABEL es Record<string,string> y la lectura usa fallback FOCUS_LABEL[profile.focusMode] ?? profile.focusMode (Profile.tsx:9-12,63): focusMode es un union 'single'|'multi', así que el tipo podría ser Record<FocusMode,string> y el fallback sobra — defensa contra un caso imposible
- [ ] updateProfilePrefs siempre escribe ambos campos aunque solo cambie uno (profile.ts:76); sin dirty-check en la UI, además se llama aun sin cambios — escritura redundante

### Shell y navegación
- [ ] SideNav.tsx:37 ternario days===1 con ambas ramas iguales: borrar el ternario y dejar 'en Hito' (o pluralizar de verdad).
- [ ] El emoji '😵‍💫' a 44px en ErrorBoundary (ErrorBoundary.tsx:28) y los emojis de tema (theme.ts:12-14) son la única inconsistencia con el set de íconos SVG inline propio (icons.tsx); menor, pero conviven dos lenguajes visuales.
- [ ] La doble definición de :focus en components.css:1600-1602 (input/textarea/select) parece redundante con base.css:111-116; revisar si la regla repetida en components.css aporta algo o es residuo de refactor.
- [ ] Ambos arrays NAV (SideNav.tsx:6-11) y TABS (BottomNav.tsx:4-9) son idénticos salvo el ícono IconHito; podrían centralizarse en un único módulo de rutas para no desincronizarse al agregar/quitar pestañas.

---

_Totales: 16 alta · 37 media · 35 baja · 24 bugs (roto) · 34 limpieza · + 4 mejoras determinísticas._