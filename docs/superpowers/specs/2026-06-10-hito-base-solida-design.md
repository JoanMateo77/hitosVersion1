# Lógralo (antes Hito) — Base sólida: rediseño de lógica, compromiso y experiencia

> Diseño validado con el usuario el 2026-06-09/10 (brainstorming con mockups en navegador).
> Objetivo: una base de producto publicable y digna de pago, **sin IA**. La IA y los planes
> pagos se montan después sobre esta base.

## 1. Problema

La auditoría de mayo (AUDITORIA.md) y la revisión de producto detectaron que la app no cumple
su objetivo:

- **El progreso es decorativo.** `goals.current_milestone` es un contador manual sobre hitos
  que son texto fijo de plantilla. Tocar un hito "salta" el progreso; se puede marcar una meta
  "lograda" con cero trabajo real. Nada valida nada.
- **Las preguntas no comprometen.** El wizard y el onboarding preguntan cosas blandas y
  opcionales; las metas nacen huecas (sin días, sin tiempo, sin horario).
- **El plan del día es aleatorio.** `pickAction` elige una acción por hash de un pool genérico;
  no refleja ningún compromiso del usuario.
- **El calendario está desconectado.** Sin recurrencia, sin vínculo real con metas; los eventos
  de día completo prometen sumar tiempo y suman 0.
- **La app es una libreta.** Registra checks; no acompaña: nada empieza, transcurre ni termina.
- **Identidad difusa.** 3 temas (claro papel, neón, negro) = 3 personalidades; copy en voseo
  que el usuario ya no quiere.

## 2. Decisiones de producto (cerradas con el usuario)

| Decisión | Elección |
|---|---|
| Modelo de progreso | **Plan comprometido medible**: el progreso se calcula de hitos cumplidos y sesiones reales; nunca se setea a mano |
| Compromiso al crear meta | **Mínimo obligatorio**: días + duración/cantidad por momento; hora opcional por momento; porqué/criterio siguen opcionales |
| Momentos por día | Un día comprometido puede tener **1..n momentos** (ej. 30 min a las 10:00 y 30 min a las 14:00), cada uno con su duración y hora opcional |
| Paso de compromiso del wizard | **Una sola pantalla** (días + momentos + horas, con resumen vivo) |
| Sesiones vivas | **Cronómetro + estados de sesión en la base; Web Push en fase final** |
| Regreso con reloj vencido | **Preguntar cómo te fue**: Completa / Parcial (elige cuánto) / No pude — nunca auto-completar |
| Vista de calendario | **Tira semanal + agenda del día**, con **mes completo expandible** (grilla con puntos por meta) |
| Onboarding | **Guiado con salida discreta**: termina con la primera meta creada y la primera sesión agendada; "Prefiero mirar la app primero" en pie de página |
| Pregunta de dedicación | "¿Cuánto tiempo puedes dedicarle a esta meta?" — presets + **"Otro: tú decides cuánto"** sin techo |
| Nombre y marca | **"Lógralo"** (decidido 2026-06-10 tras análisis de marketing sobre 25+ candidatos: verbo-promesa, el boca a boca lleva la orden incluida). Wordmark global sin tilde: **LOGRALO**. Eslogan: *"Lo dijiste. Lógralo."* Ícono: el check naranja. Subtítulo de tienda (ASO): "Lógralo — metas y hábitos con compromiso". Estrategia: español/LatAm primero; el wordmark sin tilde ya funciona como marca acuñada para expansión. Pendiente del usuario: comprar `logralo.app` (logralo.com está tomado desde 2009) |
| Modo "Enfoque" (una/varias) | **Se elimina** — con compromiso por sesiones, ocultar metas rompería el contrato. Lo reemplazan: recomendación de UNA meta en onboarding, guardia de sobrecompromiso en el wizard, y meta prioritaria ⭐ opcional que ordena el día sin ocultar nada |
| Crecimiento orgánico | **Tarjetas de logro compartibles** (al cumplir hitos y metas): imagen con el logro + la marca; cada share lleva el call-to-action en el nombre. Fase 4 |
| Identidad visual | **Una identidad, dos variantes (claro/oscuro cálido)**. Paleta funcional: naranja = acción, verde = logrado, ámbar/rojo suave = atención sin culpa. Tinte sutil por meta en tarjetas. Se eliminan los temas neón y papel actuales |
| Copy | **Español profesional y neutro (tuteo)** en toda la app. Se elimina el voseo |

### Criterio frente a referentes (Grit y otros): mérito, no diferenciación

Regla acordada con el usuario: **no evitamos nada "por no parecernos" ni copiamos nada "por
parecernos"** — cada patrón se adopta o descarta por lo que aporta a Hito. Aplicado a Grit:

**Adoptado por mérito**: tinte por meta en las tarjetas (reconocimiento sin leer), botón de
registro circular grande de un toque, cronómetro por sesión, y **acceso rápido a días
recientes desde Hoy** (mini tira de la semana en el header con puntos de estado: permite ver
cómo viene la semana y corregir el registro de ayer sin ir al calendario).

**Descartado, con la razón explícita (no por diferenciarnos)**:
- Tarjetas totalmente saturadas: con 2-4 sesiones/día (vs 10-15 hábitos) deja la pantalla
  vacía y ruidosa; en Hito la jerarquía la da la narrativa (meta → etapa → sesión → porqué).
- Contadores de deuda tipo "−7": gamificación punitiva; la evidencia de retención en wellness
  favorece refuerzo positivo — la culpa expulsa usuarios.
- Buscador en el plan del día: con 1-5 metas activas no hay nada que buscar.

Si durante la implementación un patrón de un referente resuelve mejor un problema, se adopta
y se documenta la razón — el parecido no es argumento ni a favor ni en contra.

## 3. Modelo de datos

### 3.1 Tabla nueva: `milestones`

Los hitos dejan de ser texto de plantilla y pasan a ser datos de cada meta.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `goal_id` | uuid FK → goals, ON DELETE CASCADE | |
| `user_id` | uuid FK → auth.users | RLS igual que tablas existentes |
| `title` | text NOT NULL | editable |
| `position` | int NOT NULL | orden, reordenable |
| `target_date` | date NULL | fecha objetivo de la etapa |
| `done_at` | timestamptz NULL | cumplido individualmente |
| `created_at` | timestamptz | |

Al crear una meta, los hitos de la plantilla se **copian** aquí como punto de partida; desde
ese momento pertenecen al usuario (editar, agregar, borrar, reordenar).

### 3.2 Tabla nueva: `goal_schedule` (el compromiso)

Una fila por **bloque/momento** comprometido.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `goal_id` / `user_id` | uuid FK | RLS |
| `weekday` | smallint 0-6 (lunes=0) | |
| `target_kind` | text: `'time'` \| `'count'` | |
| `target_value` | int NOT NULL | minutos o cantidad |
| `unit` | text NULL | para count: "páginas", "km"… |
| `start_time` | time NULL | la hora del momento; opcional |
| `created_at` | timestamptz | |

Un día con dos momentos = dos filas. La cadencia fija de plantilla (`cadence`) muere.

### 3.3 Tabla nueva: `sessions`

La unidad de trabajo real. Reemplaza a las tasks `source='goal'` derivadas por hash.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `goal_id` / `user_id` | uuid FK | RLS |
| `schedule_id` | uuid FK → goal_schedule NULL | NULL = sesión espontánea ("¿Hoy mismo?") |
| `date` | date NOT NULL | día del plan |
| `target_kind` / `target_value` / `unit` | | copiados del schedule al generarla (histórico estable) |
| `planned_time` | time NULL | hora planificada |
| `started_at` | timestamptz NULL | arranque del cronómetro |
| `ended_at` | timestamptz NULL | |
| `actual_value` | int NULL | minutos o cantidad reales |
| `status` | text | `pending` → `running` → `done` \| `partial` \| `missed` \| `unconfirmed` |
| UNIQUE | (`schedule_id`, `date`) | idempotencia de generación |

Generación: al cargar "Hoy" (igual que el guard actual de Today) se crean las sesiones del día
desde `goal_schedule`. Las **acciones de plantilla** pasan a ser *sugerencias de contenido*
mostradas dentro de la tarjeta de sesión (solo UI, no filas).

### 3.4 Cambios en tablas existentes

- **`goals`**: se elimina `current_milestone`. Se conservan `title, why, target_date, area,
  success_criteria, template_key, status, completed_at, last_reviewed_at`.
- **`tasks`**: queda solo para tareas libres del usuario (`source='user'`). Las tasks de meta
  dejan de generarse.
- **`profiles`**: se agregan `preferred_moment` (`morning|midday|evening` NULL) y
  `default_session_minutes` (int NULL) — defaults capturados en onboarding. `focus_mode`
  queda obsoleto (deja de leerse; se elimina en una migración posterior). Se agrega
  `priority_goal_id` (uuid NULL) para la meta prioritaria ⭐ opcional.
- **`push_subscriptions`** (fase 5): `id, user_id, endpoint, keys jsonb, created_at`.

### 3.5 Migración de datos existentes

1. Para cada meta: copiar los hitos de su plantilla a `milestones`, marcando `done_at = now()`
   en los primeros `current_milestone`.
2. Crear `goal_schedule` desde la `cadence` de su plantilla (weekdays → Lu-Vi, thrice_week →
   Lu/Mi/Vi, daily → todos) con `target_kind='time'`, `target_value=25`.
3. Tasks históricas `source='goal'` con `status='done'` se conservan para el conteo histórico
   de acciones (solo lectura); no se migran a sessions.
4. Tema guardado `neon`/`claro` en localStorage migra a la variante nueva más cercana.

## 4. Lógica de dominio (pura, en `src/domain/`)

### 4.1 Progreso y consistencia

- `milestoneProgress(milestones) = done / total` → barra de progreso de la meta.
- `weekConsistency(sessions, schedule, week) = sesiones cumplidas / comprometidas` (done y
  partial cuentan; partial se muestra distinto).
- Tiempo invertido = `sum(actual_value)` de sesiones `time` (real, no estimado).
- **Racha**: días consecutivos con ≥1 sesión done/partial, contando **solo días comprometidos**
  (si no comprometiste el finde, el finde no rompe la racha). Se guarda también el récord.

### 4.2 Ciclo de vida de la sesión (máquina de estados)

```
pending → running (started_at = now)
running → done | partial            (usuario confirma; actual_value registrado)
running → unconfirmed               (abierta > 24 h; se cierra sola, no bloquea el día nuevo)
pending → done | partial | missed   (check directo sin cronómetro; missed al cerrar el día)
```

- El cronómetro corre por **timestamps**, no por timers en memoria: cerrar la app no lo detiene.
- Reloj vence con app abierta → celebración + confirmación en un toque.
- Reloj venció con app cerrada → al volver, pantalla de cierre: **"✓ La completé" / "Hice una
  parte…" (elige cuánto) / "Hoy no pude"** — sin culpa.
- Para `count`: contador +/− con barra (sin cronómetro).

### 4.3 Reglas de logro (matan el bug "1 paso = lograda")

1. Cada hito se marca individualmente (`done_at`); puede desmarcarse. No existe "saltar a un hito".
2. Completar el **último** hito pendiente → celebración + ofrecer "¿La damos por lograda?".
   **Nunca** se cierra sola.
3. "Marcar como lograda" con hitos pendientes → confirmación explícita que lista los pendientes:
   "Ya los cumplí" (los marca) / "Cerrar igual" (quedan como no cumplidos).
4. "Marcar como lograda" vive en el menú "⋯" del detalle mientras el camino esté incompleto;
   se vuelve protagonista solo con el camino completo.
5. `status='done'` siempre con `completed_at`; reactivar lo limpia.

## 5. Pantallas

### 5.1 Onboarding (guiado con salida discreta)

1. **Promesa** (1 pantalla): qué hace Hito distinto. Sin tour largo.
2. **¿Qué quieres cambiar primero?** — nichos como tarjetas, **con "Otra" visible**;
   "No estoy seguro" → entrevista de 3 preguntas (se mantiene, con progreso honesto en el
   stepper y selección visible al volver atrás).
3. **¿Cuánto tiempo puedes dedicarle a esta meta?** — 15/30/60 min al día + "Otro: tú decides"
   (stepper libre, sin techo). Alimenta defaults del wizard.
4. **¿Cuándo te es más fácil cumplir?** — mañana / mediodía / noche → default de horas.
5. → **Wizard precargado**. El onboarding termina con la primera meta creada y el contrato a la
   vista: "Lu·Mi·Vi — 25 min, 19:00. Comenzar mañana" + atajo "¿Prefieres hoy? Tu primera
   sesión puede ser ahora".
- Salida discreta "Prefiero mirar la app primero" al pie → Hoy con estado vacío que invita a crear.
- Borrador del onboarding persistido (sessionStorage) como ya hace el wizard.

### 5.2 Wizard de meta (6 pasos)

1. ¿Qué quieres lograr? (título, obligatorio; detección de plantilla ya arreglada)
2. Tipo de meta (plantilla sugerida, cambiable)
3. **Tu compromiso** (obligatorio, una pantalla): chips de días; por día seleccionado, 1..n
   momentos con stepper de duración (o cantidad+unidad) y **recuadro de hora opcional** al lado
   ("🕐 10:00" / "🕐 Hora…"); "+ añadir otro momento"; resumen vivo
   ("Lu 25 min · Vi 10:00 y 14:00 — 1 h 25 min por semana"). Defaults desde onboarding.
   **Guardia de sobrecompromiso**: si un día elegido ya acumula sesiones de otras metas, el
   resumen lo advierte ("Los lunes ya tienes 3 sesiones — 1 h 30. ¿Seguro que entra otra?")
   sin bloquear.
4. **Tu camino** (hitos de plantilla copiados, editables ahí mismo: renombrar, borrar, agregar,
   reordenar, fecha opcional por hito)
5. Tu ancla (porqué + criterio de éxito + fecha objetivo; opcionales, con sugerencias por plantilla)
6. Resumen "tu contrato" + Crear → GoalCreated muestra camino + primera sesión real persistida
   (no recalculada), con celebración.

### 5.3 Hoy

- Header: fecha + racha (🔥 con récord en Progreso) + **mini tira semanal** con puntos de
  estado por día; tocar un día pasado abre sus sesiones para ver/corregir el registro (ej.
  "ayer sí la hice"); tocar un día futuro abre la agenda de ese día.
- **Tus sesiones de hoy (X de Y)**: tarjeta por sesión con tinte sutil del color de la meta,
  emoji + meta + objetivo del momento ("25 min" / "10 páginas"), hora si la tiene, sugerencia
  de contenido de plantilla, porqué como ancla, botón circular grande **▶ Empezar** + check
  directo para quien no quiere cronómetro.
- **Lo que sumaste tú**: tareas libres (tabla `tasks`), input para agregar.
- **Tu agenda**: eventos del día; tocar uno abre el calendario en ese día.
- Máximo **un aviso contextual** sobre el plan (prioridad: revisión semanal > meta olvidada >
  foco semanal). Se acabó el apilamiento de 6 tarjetas.
- Día sin compromisos: estado vacío que guía ("Hoy no comprometiste sesiones — ¿una espontánea?").
- Optimismo con **rollback** en todas las mutaciones (toggle, editar título) — patrón
  `withErrorHandling(onRollback)`.

### 5.4 Sesión en curso

- Pantalla dedicada: anillo de cuenta regresiva (números tabulares), porqué en el centro,
  ⏸ Pausar / Terminé ✓. Para `count`: contador +/− con barra.
- Flujo de regreso según 4.2. Celebración breve (haptic + animación corta, respeta
  `prefers-reduced-motion`).

### 5.5 Detalle de meta

- Bloque de progreso calculado: barra de etapas (X de N), consistencia semanal (2/3),
  sesiones totales, tiempo invertido real.
- **Tu compromiso**: chips por momento ("Lu · 25 min", "Vi · 10:00 45 min") editables (alta,
  baja, duración, hora). Editar reprograma solo sesiones futuras.
- **El camino**: checklist de hitos (marcar/desmarcar, fecha, editar, agregar, reordenar).
  Hito actual resaltado con el color del nicho.
- Acciones: Pausar / "⋯ Más" (lograda con confirmación, archivar, editar meta).
- "Esta semana agendadas" (eventos con horario vinculados) separado de "invertidas" (sesiones).

### 5.6 Calendario

- **Vista A**: tira semanal deslizable (puntos de estado por día: lleno = hecho, borde = pendiente,
  color por meta) + agenda del día seleccionado. Tocar el título del mes **expande la grilla
  mensual completa** con puntos; tocar un día vuelve a la agenda.
- Agenda del día: sesiones comprometidas (estado + hora), eventos propios, hitos con fecha (📍).
- Tocar sesión → hoja: fijar/cambiar hora ("¿A qué hora te queda cómodo?" con presets según
  `preferred_moment`; "todos los martes" vs "solo este día"), ver meta, empezar.
- Eventos propios: igual que hoy + validación `end > start` con error inline; editar fecha fuera
  del rango cargado refetchea (mata los eventos fantasma).
- Semántica honesta: **agendado** (eventos/bloques con hora) ≠ **invertido** (sesiones hechas).
  El hint engañoso de "vemos cuánto tiempo le dedicas" se corrige.

### 5.7 Progreso

- **Tu semana**: anillo global (sesiones hechas/comprometidas de todas las metas) + 7 días
  (verde = cumplido, ámbar = parcial, punteado = por venir) + racha con récord.
- **Tus metas**: tarjeta por meta activa (barra de etapas, consistencia, tiempo invertido,
  próximo hito con fecha) → navega al detalle.
- **Últimas 8 semanas**: barras de % de cumplimiento semanal.
- **Tu camino**: timeline de hitos cumplidos y metas logradas (cada hito es celebrable).
- Usuario nuevo: muestra el plan de la semana vacío con guía, nunca ceros tristes.

### 5.8 Revisión semanal (re-propósito)

Ya no pregunta "¿avanzaste?" (los datos lo saben). Es el **cierre de semana**: resumen de
consistencia real por meta + propuesta de ajuste si el compromiso quedó grande/chico
("Cumpliste 1 de 4 — ¿bajamos a 2 días esta semana?") + hitos próximos. Aparece como el aviso
contextual de Hoy el día de revisión.

### 5.9 Metas (lista), Perfil, Auth

- **Metas**: tarjetas con tinte por nicho, barra de etapas y consistencia; agrupadas
  activas/pausadas/cerradas. Estrella ⭐ para marcar la meta prioritaria (opcional).
- **Perfil** (diseño validado): cabecera con cuenta; **Tu ritmo** (momento preferido, sesión
  por defecto — el nicho ya no se edita aquí: vive en cada meta); **Notificaciones** (toggles
  por tipo; "cuidar tu racha" apagado por defecto; si el navegador no soporta push se explica);
  **Apariencia** (claro/oscuro/sistema); **Cuenta**: cambiar contraseña, cerrar sesión y
  **eliminar cuenta** (borrado de datos + usuario vía Edge Function — requisito de tiendas);
  versión y legales al pie.
- **Auth**: copy alineado a la promesa, errores de Supabase mapeados a mensajes claros,
  estado de "no me llegó el mail" con reenvío.
- **Tarjetas de logro compartibles** (motor orgánico, fase 4): al cumplir un hito o lograr una
  meta, generar una tarjeta-imagen ("Logré: correr 5K — 12 semanas, 47 sesiones") con el
  wordmark; compartir nativo (Web Share API).

## 6. Sistema visual

- **Una identidad, dos variantes**: claro cálido (default según sistema) y oscuro cálido.
  Se eliminan `neon` y el claro papel actual; migración del valor guardado.
- **Paleta funcional**: base crema `#fdf8f2` / oscuro cálido `#15110e`; superficie blanca /
  `#1f1a15`; **naranja `#f97316`** solo en acciones (Empezar, cronómetro, racha); **verde
  `#16a34a` / `#22c55e`** solo en lo cumplido (checks, barras, hitos); ámbar para parcial;
  rojo suave para error. Texto cálido (`#241c14` / `#f2ece4`).
- **Tinte por meta**: tarjetas de sesión/meta con gradiente sutil del color del nicho
  (nunca saturado tipo Grit); el color por nicho existente se recalibra para ambas variantes.
- **Tipografía**: serif display para títulos (ya existe), sans para UI, números tabulares en
  cronómetro y contadores.
- **Estándares móviles**: nav inferior de 4 secciones (Hoy, Metas, Agenda, Progreso) + acción
  central "+"; Perfil se accede desde el avatar en la barra superior. Escala de 8 px, esquinas 12-16 px, safe-areas, hit-areas ≥44 px, estados vacíos
  que guían, esqueletos de carga, sin saltos de layout, haptics en celebraciones, splash e ícono
  coherentes con la identidad.
- **Limpieza**: los estilos inline regados por los TSX se consolidan en clases/componentes.
- **Marca**: rebranding completo a Lógralo — ícono de app (check naranja sobre degradado),
  splash con wordmark, manifest de PWA, títulos y metadatos. La referencia analizada (Grit)
  y la psicología del color aplicada quedan documentadas en `.superpowers/brainstorm/`.

## 7. Copy

Todo el texto de la app pasa a **español profesional y neutro (tuteo)**: "¿Qué quieres
lograr?", "Elige 3 días", "Inténtalo de nuevo". Sin voseo. Tono claro, directo y cálido, sin
infantilizar. Revisión completa de las 13 pantallas + errores + estados vacíos.

## 8. Notificaciones (fase final)

- Web Push (service worker + `push_subscriptions` + Supabase Edge Function + VAPID).
- Disparadores: hora de sesión ("Tu sesión de inglés comienza a las 19:00"), fin de cronómetro
  ("¿Cómo te fue?" → abre la pantalla de cierre), rescate de racha opcional por la noche.
- Permiso pedido **en contexto** (al fijar la primera hora), nunca al abrir la app.
- Limitación documentada: iOS requiere PWA instalada (16.4+); Android/desktop completo.
- Sin tono punitivo; el rescate de racha es opt-in y desactivable en Perfil.

## 9. Manejo de errores

- Mutaciones optimistas **siempre** con rollback (patrón único `withErrorHandling`).
- Errores de backend nunca crudos: mapa de errores → mensajes claros en tuteo.
- Estados de error con reintento (LoadingScreen ya lo soporta); nada redirige en silencio.
- Validaciones inline: `end > start` en eventos, duración > 0, ≥1 día en compromiso.

## 10. Testing

- Dominio puro con tests (como hoy): progreso, consistencia, racha (solo días comprometidos,
  parciales, huecos), máquina de estados de sesión (incl. vencimiento >24 h y cierre por
  timestamps), generación idempotente de sesiones, reglas de logro.
- Tests de migración SQL sobre datos de ejemplo (metas con `current_milestone` en 0/medio/full).
- Smoke E2E de los caminos: onboarding → primera meta → primera sesión; sesión con cronómetro
  cerrar/reabrir; completar último hito → lograr meta.

## 11. Fases de implementación

1. **Fase 1 — Modelo y compromiso**: migraciones (milestones, goal_schedule, sessions, profiles),
   dominio nuevo con tests, wizard rediseñado, GoalCreated. La app sigue funcionando.
2. **Fase 2 — El día vivo**: Hoy con sesiones, cronómetro/contador, flujo de regreso, detalle
   de meta nuevo (camino checklist + compromiso editable + reglas de logro).
3. **Fase 3 — Calendario**: vista semana+mes expandible, sesiones en agenda, fijar hora,
   validaciones de eventos.
4. **Fase 4 — Progreso, revisión y pulido**: Progreso nuevo, revisión semanal re-propósito,
   lista de Metas, Perfil, Auth, identidad visual completa (paleta funcional, tintes, copy
   profesional en toda la app, limpieza de estilos inline).
5. **Fase 5 — Notificaciones**: Web Push completo.

Cada fase termina con `typecheck` + tests verdes y la app usable.

## 12. Fuera de alcance (explícito)

- IA (queda para después, sobre esta base), pagos/planes, social/compartir, recurrencia de
  eventos propios (las sesiones cubren la recurrencia), apps nativas, export de datos.
