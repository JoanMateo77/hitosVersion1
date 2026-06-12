# Lógralo — Casos de uso

> Derivados del código real el 2026-06-12. Actor único: **Usuario** (persona con cuenta). Formato compacto: precondición → flujo principal → alternativas → postcondición, con la pantalla/archivo que lo implementa.

## CU-01 · Registrarse y entrar

- **Pantalla:** Auth (`src/screens/Auth.tsx`)
- **Precondición:** sin sesión activa.
- **Flujo principal:** elige "Crea tu cuenta" → email + contraseña (≥6) → si el proyecto exige confirmación, ve aviso y confirma desde su email → entra.
- **Alternativas:** A1: ya tiene cuenta → "Entrar". A2: contraseña olvidada → "¿Olvidaste tu contraseña?" → recibe email de recuperación. A3: error (credenciales, rate-limit, red) → mensaje claro en español.
- **Postcondición:** sesión iniciada; si no completó onboarding, es llevado a `/onboarding`.

## CU-02 · Completar el onboarding

- **Pantalla:** Onboarding (`src/screens/Onboarding.tsx`)
- **Precondición:** sesión iniciada, `profile.onboardedAt` vacío.
- **Flujo principal:** promesa → elige área (8 opciones) → minutos diarios (15/30/60 o personalizado, mínimo 5) → momento preferido (mañana/mediodía/noche/depende) → "Crear mi primera meta".
- **Alternativas:** A1: "No estoy seguro" → mini-entrevista de 3 preguntas que sugiere un área (puede cambiarla). A2: "Prefiero mirar la app primero" → va a Hoy sin completar; cualquier intento de crear meta lo devuelve al onboarding. A3: error al guardar → alerta y reintento.
- **Postcondición:** perfil con área, minutos y momento; aterriza en el Wizard con esos defaults.

## CU-03 · Crear una meta con el asistente

- **Pantalla:** Wizard (`src/screens/Wizard.tsx` + `components/wizard/*`)
- **Precondición:** onboarding completo.
- **Flujo principal:** título (detecta tipo/área) → plantilla (siembra etapas) → compromiso semanal (días + tiempo/cantidad + hora opcional; valida ≥1 bloque con valores >0; avisa sobrecarga sin bloquear) → etapas (editar/reordenar/fechar; mínimo 1 con texto) → ancla opcional (porqué/fecha/criterio) → revisar → "Crear meta".
- **Alternativas:** A1: "Ver ideas" → CU-04. A2: abandona a mitad → el borrador queda en sessionStorage y se restaura al volver. A3: fallo al crear → mensaje genérico, borrador intacto; si la creación quedó a medias, se revierte (rollback con deleteGoal).
- **Postcondición:** meta + etapas + bloques de compromiso en BD; sesiones de hoy generadas; pantalla "Meta creada" con camino, compromiso y primera sesión.

## CU-04 · Adoptar una meta sugerida

- **Pantalla:** GoalSuggestions (`src/screens/GoalSuggestions.tsx`)
- **Precondición:** onboarding completo; llega por "Ver ideas", por estado vacío de Metas, o tras lograr una meta.
- **Flujo principal:** ve 2-3 metas concretas de su área → toca una → el asistente se abre directo en el paso de compromiso, con título, tipo y etapas ya armados → completa compromiso → crea.
- **Alternativas:** A1: `?area=` inválida en la URL → cae al área del perfil sin aviso. A2: "Escribir mi propia meta" → CU-03 desde cero.
- **Postcondición:** igual que CU-03. Invariante: toda meta nace con compromiso.

## CU-05 · Ejecutar la sesión del día (cronómetro)

- **Pantalla:** SessionRun (`src/screens/SessionRun.tsx`)
- **Precondición:** sesión de hoy en estado pendiente.
- **Flujo principal:** desde Hoy toca ▶ → la sesión arranca (auto-start con `?start=1`) → el reloj corre por timestamps → al llegar al objetivo: vibración + celebración → "Terminé" → "La completé" → anota qué logró (opcional) → si hay etapa en curso, decide si la marca → vuelve a Hoy.
- **Alternativas:** A1: pausa/reanuda (solo tiempo; si falla la red, ve un aviso y puede reintentar). A2: "Seguir un rato más" → el reloj cuenta hacia arriba y guarda el total real. A3: "Terminé" antes del objetivo → "Hice una parte…" con selector de cuánto → parcial. A4: "Hoy no pude" → cierra sin nota ni etapa, sin fricción. A5: objetivo por cantidad → contador +/− en vez de reloj.
- **Postcondición:** sesión done/partial/missed con valor real; nota en el diario de la meta; racha actualizada.

## CU-06 · Marcar la sesión como hecha sin cronómetro

- **Pantalla:** Today (`src/screens/Today.tsx`, `quickDone`)
- **Precondición:** sesión de hoy pendiente; el trabajo ya se hizo fuera de la app.
- **Flujo principal:** toca ✓ en la tarjeta → la sesión pasa a hecha con el objetivo completo → mensaje de ánimo si es la primera o la última del día.
- **Alternativas:** A1: error de red → la tarjeta vuelve a su estado y ve el aviso. A2: se equivocó → "Deshacer" la regresa a pendiente.
- **Postcondición:** sesión done; cuenta del día y racha actualizadas. (Sin oportunidad de nota — ver mejoras frescas #8.)

## CU-07 · Resolver una sesión que quedó abierta

- **Pantallas:** Today (aviso) + SessionRun (resolución)
- **Precondición:** una sesión quedó corriendo otro día (estado "sin confirmar", ≤7 días).
- **Flujo principal:** Hoy muestra el aviso prioritario "Quedó una sesión abierta de X. ¿Cómo te fue?" → la abre → panel de resolución directo (sin cronómetro) → elige completa/parcial/no pude.
- **Postcondición:** la sesión queda cerrada con la verdad del usuario; el aviso desaparece.

## CU-08 · Corregir un día pasado ("sí la hice")

- **Pantalla:** Today (tira semanal)
- **Precondición:** un día pasado de la semana muestra "sin cumplir" pero el usuario sí trabajó.
- **Flujo principal:** toca el día en la tira → ve las sesiones de ese día → "Sí la hice" en la que corresponda → se marca hecha con el objetivo completo → toast "Día corregido. Tu racha lo refleja."
- **Postcondición:** historial y racha corregidos honestamente.

## CU-09 · Crear y mantener un hábito

- **Pantallas:** Habits (`src/screens/Habits.tsx`) + Today (marcado) + Learn (CTA)
- **Precondición:** sesión iniciada.
- **Flujo principal:** pestaña Hábitos → "Crear" (o adopta una idea popular) → nombre + área + días (vacío = todos) → crear (toast de confirmación) → cada día que toca, lo marca en Hoy con un toque.
- **Alternativas:** A1: desde una lección de Aprender → formulario precargado por deep-link. A2: editar días o archivar desde el menú ⋯. A3: desmarcar un día marcado por error (toggle).
- **Postcondición:** hábito activo con su semana visual y racha; aparece en Hoy los días que aplica.

## CU-10 · Seguir y editar una meta

- **Pantalla:** GoalDetail (`src/screens/GoalDetail.tsx`)
- **Precondición:** al menos una meta.
- **Flujo principal:** Metas → toca la meta (vista previa) → "Abrir meta" → ve porqué, progreso (etapa, sesiones de la semana, tiempo invertido), compromiso, camino y diario de avances → marca etapas al cumplirlas.
- **Alternativas:** A1: editar campos (título/porqué/fecha/área/criterio). A2: editar compromiso inline → la sesión de hoy se regenera. A3: pausar / archivar / reactivar. A4: al marcar la última etapa → "¿La damos por lograda?" (nunca se cierra sola). A5: "Marcar como lograda" con etapas pendientes → confirmación: márcalas y lógrala / ciérrala igual / cancelar.
- **Postcondición:** meta al día; si se logró: celebración + compartir logro + ideas para la próxima.

## CU-11 · Hacer la revisión semanal

- **Pantalla:** Review (`src/screens/Review.tsx`)
- **Precondición:** ≥1 meta activa con revisión vencida (según la cadencia de su plantilla).
- **Flujo principal:** aviso en Hoy → "/revision" → meta por meta: sigo / cumplí la etapa / la logré (si es la última) / pausar → resumen final con conteo → "Ver cómo vas" (Progreso) o volver a Hoy.
- **Alternativas:** A1: sin metas vencidas → "Nada para revisar". A2: error al guardar una acción → alerta y reintento sin perder el avance.
- **Postcondición:** metas revisadas (no vuelven a avisar hasta la próxima cadencia), etapas/estados actualizados.

## CU-12 · Planificar con la agenda

- **Pantalla:** Calendar (`src/screens/Calendar.tsx`)
- **Precondición:** sesión iniciada.
- **Flujo principal:** Agenda → vista día/semana/mes → ve sesiones comprometidas (incluso futuras, "proyectadas"), eventos y deadlines → a una sesión sin hora le fija "¿a qué hora te queda cómodo?" (queda para todos los semanales de ese día y dispara el recordatorio si hay push).
- **Alternativas:** A1: crear evento (día completo u horario validado fin>inicio) con meta vinculada opcional → ese tiempo se suma a la meta. A2: editar/borrar evento (confirmación inline). A3: sesión real de hoy → abre el cronómetro.
- **Postcondición:** semana visible y horas fijadas; eventos persistidos.

## CU-13 · Ver el progreso y aprender

- **Pantallas:** Progress + Learn (`src/screens/Progress.tsx`, `Learn.tsx`)
- **Precondición:** sesión iniciada.
- **Flujo principal:** pestaña Crecer → Progreso: semana actual, racha y récord, 8 semanas, metas activas con su etapa, línea de tiempo de logros → toggle a Aprender: colecciones → lección (idea + aplícalo hoy) → "Marcar como leída".
- **Alternativas:** A1: CTA de lección → crear hábito (CU-09) o meta (CU-03) precargados. A2: tocar una meta → su detalle.
- **Postcondición:** lectura marcada (en este dispositivo); navegación a la acción elegida.

## CU-14 · Configurar el ritmo y los recordatorios

- **Pantalla:** Profile (`src/screens/Profile.tsx`)
- **Precondición:** sesión iniciada.
- **Flujo principal:** Perfil → ajusta momento preferido y minutos por defecto (guardado optimista) → activa recordatorios (permiso del navegador → suscripción push) → elige tema.
- **Alternativas:** A1: navegador sin soporte push (o iPhone sin instalar la PWA) → instrucciones. A2: permiso bloqueado → cómo desbloquearlo. A3: cerrar sesión. A4: eliminar cuenta → confirmación inline → borra todo y vuelve a Auth.
- **Postcondición:** preferencias aplicadas a los flujos de creación y recordatorios.

## CU-15 · Recuperar la contraseña

- **Pantalla:** Auth
- **Precondición:** usuario sin sesión que olvidó su contraseña.
- **Flujo principal:** escribe su email → "¿Olvidaste tu contraseña?" → recibe email → el enlace abre la app con sesión iniciada.
- **⚠️ Hueco actual:** la app nunca le pide definir la contraseña nueva (no maneja el evento de recuperación), así que en el próximo login vuelve a estar bloqueado. Ver mejoras frescas #1.
- **Postcondición esperada (no implementada):** contraseña nueva establecida.
