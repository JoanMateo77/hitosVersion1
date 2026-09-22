# Rediseño de Hábitos (estilo iOS, acento azul) · Diseño

**Fecha:** 2026-09-22
**Estado:** aprobado por el usuario (mockup entregado en `docs/diseno/2026-09-22-habitos/`)
**Alcance:** la pantalla Hábitos completa (pestañas Hoy / Todos / Archivados, primer uso,
deslizar, micro-momentos), la hoja "Nuevo hábito" en 3 pasos (también sirve para editar) y la
pantalla de detalle de un hábito. Las zonas nuevas del mockup (icono y color por hábito, veces
al día con unidad, recordatorios, saltar hoy, pausar hasta, archivar con historial, mejor racha,
mes en cuadrícula) se hacen **funcionales**, no decorativas. Sigue el sistema visual del rediseño
de Hoy (`2026-09-21-rediseno-hoy-ios-design.md` §2: Archivo, paleta azul, radios, barra inferior).

## 1. Referencia

- `docs/diseno/2026-09-22-habitos/01-hoy.png` … `11-micro-momentos.png`: capturas objetivo
  (393 × 852, solo tema oscuro). El tema claro se deriva con los tokens (§2).
- `docs/diseno/2026-09-22-habitos/habitos-mockup.html`: HTML del mockup con todos los valores
  exactos. Es la fuente de verdad ante cualquier duda (tamaños, pesos, radios, degradados).
- Reglas del repo: español neutro con tuteo; estilos solo con tokens (los colores de identidad
  de hábito se agregan a `tokens.css`); sin `eslint-disable`; sin dependencias nuevas; sin
  atribución a IA en commits/PR.

## 2. Modelo de datos (migración `0016_habitos_identidad.sql`)

El usuario corre la migración por su cuenta (nunca manejamos credenciales). Los servicios
toleran que aún no esté aplicada, con el mismo patrón que `goal_id`/`times`: si PostgREST
responde "columna/tabla inexistente" (`42703`, `PGRST204`, `42P01`, `PGRST205`) se reintenta sin
las columnas nuevas o se devuelve vacío.

```sql
alter table public.habits add column if not exists icon text;            -- emoji
alter table public.habits add column if not exists color text;           -- clave de paleta (§2.1)
alter table public.habits add column if not exists unit text;            -- "vasos", "páginas"… (opcional)
alter table public.habits add column if not exists times_per_day smallint not null default 1;
alter table public.habits add column if not exists paused_until date;    -- pausado hasta esa fecha inclusive
-- Backfill: los hábitos con horas ya eran "N veces al día".
update public.habits set times_per_day = greatest(1, coalesce(array_length(times, 1), 1));

create table if not exists public.habit_skips (      -- "Saltar hoy": el día no cuenta
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);  -- + RLS "all own" + índice (user_id, date), igual que habit_checks
```

Semántica:
- `times_per_day` = repeticiones del día (objetivo). `times` pasa a ser **solo** las horas de
  recordatorio (lista "HH:MM"); puede tener cualquier cantidad. `habitTarget(h)` =
  `h.timesPerDay` (si la columna no llegó, cae a `times.length || 1` como hasta ahora).
  Slot `i` ↔ `times[i]` solo cuando `i < times.length`; si no, la repetición no tiene hora.
- `paused_until`: mientras `hoy <= paused_until` el hábito **no aplica** (no sale en Hoy ni en
  Agenda, no rompe ni suma racha). Al pasar la fecha vuelve solo.
- `habit_skips`: un salto hace que ese día **no sea aplicable** para ese hábito (racha intacta,
  no aparece en "Por hacer" ese día). Se puede deshacer.
- `HabitCheck` gana `at?: string` (ISO de `created_at`) para mostrar "· 7:12 am" en Hechos.
- Tipo `Habit` gana: `icon: string | null`, `color: HabitColor | null`, `unit: string | null`,
  `timesPerDay: number`, `pausedUntil: string | null`. Hábitos viejos sin icono/color usan el
  fallback por área (§2.2).

### 2.1 Paleta de identidad (tokens nuevos en `tokens.css`, iguales en claro y oscuro)

| Clave | Sólido (`--habit-<clave>`) | Degradado 145° (`--habit-<clave>-g1` → `-g2`) |
|---|---|---|
| cyan | #40c8dc | #4fd6ea → #22a9c2 |
| green | #34c77b | #8ad49a → #4fb56a |
| blue | #7d8cff | #93a0ff → #5b6cff |
| purple | #b98cff | #c9a4ff → #9b6dff |
| orange | #ff8a5e | #ff9d78 → #ff6a3d |
| yellow | #f5b731 | #ffc94d → #f0a11c |
| pink | #ff6b8a | #ff8fa8 → #ff5c7f |
| gray | #8e8e93 | #a1a1a6 → #6e6e73 |

El componente `HabitIcon` (`src/components/HabitIcon.tsx`) pinta el azulejo: `size` 42 (radio
13, emoji 22) por defecto; 36/11/18 (`sm`), 64/20/34 (`lg`), 88/26/46 (`xl`, con sombra
`0 10px 30px color-mix(sólido 30%)`). Setea `--hab-a` (sólido), `--hab-g1`, `--hab-g2` en el
contenedor vía `data-color`, para que las filas tiñan anillos, barras y números.

### 2.2 Catálogos (en `src/domain/habits.ts`)

- `HABIT_COLORS = ['cyan','green','blue','purple','orange','yellow','pink','gray']`.
- `HABIT_ICONS`: primero los 7 del mockup (💧 🏃 📖 🧘 💤 🥗 ✍️) y luego ~25 más (🚶 🏋️ 🧹 🎨 🎸
  🧠 💬 🙏 🌱 🍎 💊 🦷 🧴 ☀️ 🌙 📵 💰 📝 🎯 🧘‍♀️ 🚭 🚴 🏊 🎹 📚 🗣️ 🧊 …). El botón "···" del paso 1
  despliega el catálogo completo.
- Fallback por área: `defaultIconFor(area)` (salud 💪, finanzas 💰, carrera 💼, aprendizaje 📖,
  relaciones 💬, creatividad 🎨, bienestar 🌱, otra ✨) y `defaultColorFor(area)` (salud green,
  finanzas yellow, carrera blue, aprendizaje purple, relaciones orange, creatividad pink,
  bienestar cyan, otra gray). `habitIcon(h)` / `habitColor(h)` aplican el fallback.
- `HABIT_SUGGESTIONS` (`{title, icon, color, area, timesPerDay, unit, weekdays}`):
  Beber agua (💧 cyan salud, 5 vasos), Leer 20 páginas (📖 blue aprendizaje), Meditar 10
  minutos (🧘 yellow bienestar), Caminar 8.000 pasos (🚶 green salud, Lu a Vi), Dormir antes de
  11 (💤 purple bienestar), Comer verdura (🥗 green salud), Escribir 3 gratitudes (🙏 yellow
  bienestar), Escribir a alguien querido (💬 orange relaciones). Primer uso muestra las 4
  primeras; el paso 1 muestra chips con las 5 del mockup.

## 3. Dominio (`src/domain/habits.ts`, todo puro y con tests)

Se conservan las funciones actuales (Hoy, Agenda, Progreso y Detalle de meta las usan) y se
extienden sin romper firmas: `habitAppliesOn(h, date, skips?)` y `habitsDueOn(hs, date, skips?)`
aceptan un `Set<string>` de claves `"habitId|date"` (helper `skipKey(habitId, date)` y
`skipSetOf(skips)`), y respetan `pausedUntil`. Nuevas:

- `habitStreakOf(h, checks, skips, today)`: racha actual contando solo días aplicables
  (weekdays, pausa y saltos); hoy sin marcar no rompe.
- `habitBestStreak(h, checks, skips, fromISO, toISO)`: mejor racha histórica en la ventana.
- `habitMonthStats(h, checks, skips, monthISO, today)` → `{ done, applicable, ratio }` sobre
  los días aplicables ya transcurridos del mes (hasta hoy inclusive).
- `habitMonthGrid(h, checks, skips, monthISO, today)` → celdas: `blank` (huecos antes del
  día 1, lunes primero) y `{ date, state }` con `done | partial | missed | free | skipped |
  future`.
- `habitDayProgress(h, checks, date)` → `{ done, target, complete }`.
- `frequencyLabel(h)`: "Una vez al día" / "5 veces al día".
- `daysLabel(weekdays)`: "Todos los días" / "Lu a Vi" (tramo contiguo ≥ 3 días) /
  "Ma · Ju · Sa" / "Fin de semana" (Sa y Do).
- `remindersLabel(times)`: "9:00, 13:00, 17:00" / "Sin recordatorios".
- `progressLabel(h, done)`: "1 de 5 vasos" (con unidad) / "1 de 5".
- `archivedCaption(h, bestStreak, today)`: "Archivado hoy / hace 3 días / hace 2 semanas /
  hace 2 meses / en julio · mejor racha 64 días" (sin racha: solo la primera parte).
- `groupHabitsByArea(hs)` → `{ area, label, habits }[]` en el orden de `NICHES`, solo áreas con
  hábitos.
- `weekRings(hs, checks, skips, weekStartISO, today)` → 7 × `{ date, ratio, phase:
  'past'|'today'|'future' }` (ratio = hábitos completos / hábitos aplicables ese día; 0 si no
  aplica ninguno).
- `habitsDayStreak(hs, checks, skips, today)`: días seguidos (hacia atrás) con todos los
  hábitos aplicables completos; los días sin hábitos aplicables se saltan; hoy incompleto no
  rompe.
- `todayHeadline(hs, checks, skips, today)` → `{ done, total }` (hábitos completos / aplicables
  hoy).

## 4. Servicios (`src/services/habits.ts`)

- `createHabit` / `updateHabit` aceptan `icon`, `color`, `unit`, `timesPerDay`, `pausedUntil`;
  si la migración falta, reintentan sin las columnas nuevas (y en `updateHabit` lanzan un
  `Error` con `code: 'missing-column'` y mensaje "Para usar esta función falta actualizar la base
  de datos." cuando el parche solo traía columnas nuevas).
- `listHabitSkipsInRange(userId, from, to)` → `{ habitId, date }[]` (vacío sin migración);
  `setHabitSkipped(userId, habitId, date, skipped)` (insert idempotente / delete).
- `setHabitPausedUntil(habitId, dateISO | null)`.
- `listHabitChecksInRange` mapea `created_at` → `at`.

## 5. Pantalla Hábitos (`/habitos`, `src/screens/Habits.tsx` + `src/styles/habits.css`)

Sin TopBar (AppShell la oculta en `/habitos` y `/habitos/:id`, igual que en `/`). Columna
única, padding lateral 20, gap 16, `padding-top: safe-top + 14px`.

### 5.1 Cabecera
- H1 "Hábitos" 34px / 800 / -0.02em / 1.05. Debajo, subtítulo 15px muted según pestaña:
  - Hoy: "Lunes 21 · **2 de 6** hechos" (la fracción en `--success`, 700).
  - Todos: "5 activos · 4 áreas". Archivados: "3 archivados" / "Ningún archivado".
  - Primer uso (sin hábitos activos): solo "Martes 22".
- A la derecha, botón "+" circular 40px `--primary`, ícono 20px blanco → abre la hoja (§6).

### 5.2 Control segmentado (Hoy · Todos · Archivados)
Pista `--surface` (oscuro #1c1c1e) radio 12, padding 3; opción 13px, activa 600 blanca sobre
`--primary` con radio 9; inactivas 500 muted. La pestaña vive en `?tab=hoy|todos|archivados`
(por defecto hoy) para sobrevivir a la navegación. En primer uso no se muestra.

### 5.3 Pestaña Hoy
1. **Hint de primera vez** (`useFirstTimeHint('habitos-deslizar')`, solo si hay hábitos por
   hacer): fila `--primary-soft` radio 14, padding 10 12, ícono chevron-izquierda 16px,
   "Desliza una fila a la izquierda para saltar hoy o archivar." 13px, "Entendido" 13/600
   `--primary`.
2. **Anillos de la semana**: 7 columnas (L M X J V S D), etiqueta 11px (hoy muted, resto
   faint), anillo 26px: pasado/hoy = `conic-gradient(--success-fill 0 R%, --surface-2 R% 100%)`
   con disco interior 18px `--bg`; futuro = borde 2px `--surface-2`.
3. **Por hacer · N** (kicker 13/600/.06em mayúsculas muted, padding 0 4px) y lista en tarjeta
   `--surface` radio 20; separadores 1px `--border-soft` con margen izquierdo 68.
   Fila (padding 12 12 12 14, min-height 64, gap 12): azulejo 42 · texto (título 16/600 una
   línea con elipsis; sub 13 muted) · control 44px a la derecha.
   - Hábito de una vez: sub "Todos los días 🔥 3" (llama 12px muted + racha; sin racha:
     "Ma · Ju · Sa · sin racha" con la cola en faint). Control: anillo 44px borde 2px `--hab-a`
     opacidad .7. **Tocar el anillo marca** (una repetición); con haptic.
   - Hábito de varias veces: bajo el título, barra segmentada (`repeat(target, 1fr)`, 6px,
     radio 3, gap 3, hechas en `--hab-a`, resto `--surface-2`) + "1 de 5 vasos" 13 muted.
     Control: círculo 44px fondo `color-mix(--hab-a 18%)` con "+" 18px en `--hab-a`. Al
     completar la última: texto "5 de 5 ✓" en `--hab-a` 600, último segmento con
     `box-shadow 0 0 10px --hab-a`, control pasa a check verde con halo
     (`0 0 0 6px success 25%, 0 0 24px success 50%`, scale 1.08) durante ~1.2 s.
   - Tocar el cuerpo de la fila (no el control) navega a `/habitos/:id`.
4. **Hechos · N**: mismas filas, título en muted, sub en `--success`: "🔥 Racha de 18 días
   · 7:12 am" (hora del último check en faint; sin hora si no hay `at`). Control: círculo 44
   `--success-fill` con check 20px negro (`--success-ink`, nuevo token #000 en ambos temas),
   tocarlo **desmarca** la última repetición.
5. **Saltados hoy · N** (solo si hay): filas atenuadas, sub "Saltado hoy", acción texto
   "Deshacer" (13 muted) que quita el salto.
6. Si no hay ningún hábito aplicable hoy pero sí activos: estado vacío corto en tarjeta
   ("Hoy no toca ninguno" + "Mira Todos para ver tu semana.").

### 5.4 Deslizar (solo en la pestaña Hoy, filas por hacer)
- Izquierda: revela dos acciones de 88px de ancho a la derecha: "Saltar hoy" (`--surface-3`,
  ícono skip-forward) y "Archivar" (`--danger`, ícono archivo), 12/600 blanco, íconos 20px.
  Tocar una ejecuta y cierra. Solo una fila abierta a la vez; tocar fuera cierra.
- Derecha: fondo `--success-fill` con "✓ Hecho" (14/700, tinta `--success-ink`) alineado a la
  izquierda; soltar pasados 96px marca la siguiente repetición (haptic) y vuelve.
- Implementación con Pointer Events en `src/screens/habits/SwipeRow.tsx`: se decide eje con
  los primeros 8px (horizontal captura, vertical deja scrollear; `touch-action: pan-y`),
  translateX con `transition` al soltar, `prefers-reduced-motion` sin transición. Ninguna
  acción es solo por gesto: "Saltar hoy" y "Archivar" también viven en el detalle (§7).

### 5.5 Pestaña Todos
Grupos por área (kicker = etiqueta del área en mayúsculas) con tarjeta por grupo. Fila:
azulejo · título · sub "5 vasos · Todos los días 🔥 2" (frecuencia con unidad si > 1 vez,
días, racha si ≥ 1) · chevron derecho 16px faint. Toda la fila navega al detalle. Los hábitos
pausados muestran "Pausado hasta 30 sep" en la sub. Sin hábitos activos no se llega aquí (§5.7).

### 5.6 Pestaña Archivados
Tarjeta única con filas: azulejo con `filter: grayscale(1); opacity: .6`, título 16/600 en
muted, sub `archivedCaption` (dos líneas permitidas), botón "Reactivar" píldora 14/600
`--primary` sobre `--primary-soft` padding 8 12. Bajo la tarjeta: nota 13 muted "Los archivados
no cuentan para la racha ni aparecen en Hoy. Su historial se conserva." Vacío: centrado
vertical, caja 64 radio 20 `--surface` con ícono archivo 28px muted, "Nada archivado" 20/700,
texto muted "Cuando un hábito ya no encaje, deslízalo a la izquierda y elige Archivar. Se
guarda aquí con su historial."

### 5.7 Primer uso (sin hábitos activos; los archivados no cuentan)
Sin control segmentado. Hero: tres azulejos 64px solapados (💧 cyan, 📖 blue, 🧘 yellow) con
leves rotaciones (−8°, 0, 8°), "Tu primer hábito" 24/800 centrado, texto muted 15 centrado
"Algo pequeño que puedas hacer todos los días. Elige uno para empezar o crea el tuyo con el +."
Kicker "Sugerencias" y tarjeta con las 4 primeras sugerencias: azulejo · título · sub ("5 vasos
· Todos los días", "Lu a Vi") · botón "+" 44px `--primary-soft` con "+" `--primary`. Tocar
abre la hoja en el paso 1 con todo precargado (no crea sin confirmar). Si hay archivados, debajo
un enlace de texto "Ver archivados (n)" que cambia a esa pestaña.

### 5.8 Micro-momento "Día completo"
Cuando, en esta sesión, el día pasa de incompleto a completo (todos los aplicables hechos),
aparece una tarjeta flotante sobre la barra inferior (fixed, `bottom: 98px + safe`, margen 20):
`--surface` radio 20 padding 12 14 con `--shadow-primary`-like neutra, azulejo 52 radio 14
verde (`--success-fill`) con llama 22px `--success-ink`, "Día completo" 16/700, sub 13 muted
"6 de 6 hábitos · racha de 13 días" (`habitsDayStreak`), acción "Ver" 15/600 `--primary` →
`/progreso`. Se va sola a los 6 s o al tocar fuera; `role="status"`.

### 5.9 Deep-link
`/habitos?nuevo=TITULO&area=AREA` (lo usan Aprender y las ideas) abre la hoja en el paso 1
con título y área precargados, como hasta ahora.

## 6. Hoja "Nuevo hábito" (`src/screens/habits/HabitSheet.tsx` + `src/styles/habit-sheet.css`)

Se monta sobre el componente `Sheet` (arrastre, foco, Escape) con panel casi a pantalla
completa (`--surface`, radio 28 arriba). Props: `mode: 'create' | 'edit'`, `initial` (borrador
completo), `initialStep` (1–3), `goals` (activas), `onSaved(habit)`, `onClose`. Modo edición:
título "Editar hábito", CTA final "Guardar", "Cancelar" cierra sin guardar.

Cabecera: grid `1fr auto 1fr`, "Cancelar"/"Atrás" 17px `--primary`, título 17/600, "1 de 3"
13 muted a la derecha. Debajo, 3 barras de 3px radio 2 gap 4 (`--primary` las hechas,
`--surface-2` el resto). Contenido con scroll propio (padding 20 16, gap 18). Pie: botón 52px
radio 16 `--primary` 17/700 "Continuar" / "Crear hábito" / "Guardar", padding 12 16 + safe.

### Paso 1 · Nombre e identidad
- Azulejo `xl` centrado con el icono y color elegidos.
- Campo nombre: `--surface-2`, radio 14, padding 13 16, 17px; foco por ref al abrir;
  placeholder "Nombre del hábito"; máx 120; Enter avanza.
- **Icono**: grid 8 columnas gap 8; celdas cuadradas radio 12 `--surface-2` emoji 20px; la
  elegida con anillo `0 0 0 2px --surface, 0 0 0 4px --primary`. La octava celda "···" (12/700
  muted) despliega el catálogo completo (mismo grid, varias filas).
- **Color**: 8 círculos (`--habit-<clave>`), el elegido con anillo `0 0 0 2px --surface,
  0 0 0 4px --text`.
- **Sugerencias**: chips píldora `--surface-2` padding 8 12, 14px, "🧘 Meditar 10 min"…; tocar
  una rellena título, icono, color, área, veces y unidad.
- Validación: sin nombre no avanza (mensaje inline bajo el campo).

### Paso 2 · Frecuencia
- Tarjeta resumen `--surface-2` radio 16 padding 12 14: azulejo 42 + nombre 16/600 + área 13
  muted.
- **Frecuencia**: segmentado `--surface-2` radio 12 padding 3, 14px: "Una vez al día" /
  "Varias veces al día" (activa `--primary` blanca radio 9).
  Si varias: tarjeta `--surface-2` radio 16 alto 60 padding 0 16 "Veces al día" con stepper:
  botones − / + circulares 34px `--surface-3` 20px, valor 22/700 + unidad 14 muted (2–20).
  Debajo, campo compacto "Unidad (opcional)" placeholder "vasos, páginas…" (máx 16).
- **Días**: 7 círculos (aspect 1, 14/600) elegidos `--primary` blanco, resto `--surface-2`
  muted; enlaces 13/600 `--primary` "Todos · Entre semana · Fin de semana". Todos = lista vacía
  (semántica actual "vacío = todos").
- **Recordatorios**: tarjeta `--surface-2` radio 16, fila "Recordatorios" 48px con interruptor
  50×30 (`--success-fill` activo, `--surface-3` inactivo, disco 26 blanco); fila "Horas" con
  "9:00, 13:00, 17:00 ›" que despliega el editor de horas (inputs `type=time`, quitar,
  "+ agregar hora"). Apagar el interruptor vacía las horas al guardar. Nota: las notificaciones
  push las gestiona el perfil; aquí solo se guardan las horas (aparecen en Agenda).

### Paso 3 · Confirmar
- Kicker "Vista previa" y la fila tal como se verá en Hoy (fondo `--bg`, radio 20).
- Tarjeta `--surface-2` radio 16 con filas 48px: "Área — Salud y cuerpo ›" (despliega debajo
  la lista de áreas como opciones con radio) y "Meta vinculada — Ninguna ›".
- Kicker "Metas activas" y tarjeta por meta: glifo 36 radio 11 `--primary-soft` con ícono de
  área, título 15/600 elipsis, sub 13 muted "Etapa 2 de 4 · faltan 24 días"
  (`milestoneProgressByGoal` + `relativeDeadline`; sin etapas: solo la fecha), radio 24px
  (borde 2 faint; elegida `--primary` con punto). Tocar elige/deselecciona. Sin metas activas:
  texto "No tienes metas activas. Puedes vincularlo después."
- Nota 13 muted: "Si lo vinculas, este hábito suma al avance de la meta. Puedes cambiarlo
  después."
- CTA "Crear hábito": guarda (`createHabit`), toast "Hábito creado: …", `onSaved`, cierra.

## 7. Detalle (`/habitos/:habitId`, `src/screens/HabitDetail.tsx` + `src/styles/habit-detail.css`)

Sin TopBar. Cabecera propia: "‹ Hábitos" 17px `--primary` (vuelve a `/habitos` conservando
`?tab`) y "Editar" 17px `--primary` a la derecha (abre la hoja en modo edición, paso 1).
- Hero: azulejo `lg` 64 + nombre 24/800/-0.02em + sub 14 muted "5 vasos · Todos los días ·
  Salud y cuerpo" (frecuencia con unidad, días, área). Si está pausado: chip "Pausado hasta 30
  sep".
- Tres tarjetas `--surface` radio 16 padding 10 12: "Racha" (valor 22/800 en `--hab-a` con llama
  16px), "Mejor racha", "Este mes" (valor + " %" 14 muted 600). Datos: checks de los últimos
  365 días para este hábito.
- Tarjeta mes `--surface` radio 20 padding 12 16: "Septiembre" 15/600 · "26 de 30 días" 13
  muted (hechos / aplicables transcurridos); cabecera L…D 11px faint; cuadrícula 7 columnas gap
  5, celdas 26px radio 4: done `--hab-a`, partial `--hab-a` 40 %, missed y free `--surface-2`,
  skipped `--surface-2` con borde punteado, future borde 1.5px `--surface-2`, huecos
  invisibles. Flechas ‹ › en el título para ver meses anteriores (hasta 12).
- Tarjeta filas 48px (`--surface` radio 16, separadores 1px margen 16): "Frecuencia — 5 veces
  al día ›" (hoja paso 2), "Días — Todos ›" (paso 2), "Recordatorios — 9:00, 13:00, 17:00 ›"
  (paso 2), "Meta vinculada — Ninguna / título ›" (paso 3).
- Tarjeta acciones: "Saltar hoy" (`--primary`, solo si aplica hoy y no está completo; si ya
  está saltado: "Deshacer salto de hoy"), "Pausar hasta…" (`--primary`; despliega opciones
  Mañana · 3 días · 1 semana · Elegir fecha con `input type=date`; si está pausado, la fila dice
  "Reanudar ahora"), "Archivar hábito" (`--danger`; si está archivado: "Reactivar hábito").
  Todas con cambio optimista y revert con mensaje.
- Hábito inexistente → mensaje y enlace a Hábitos.

## 8. Integración con el resto de la app

- `AppShell`: sin TopBar en `/` y en rutas que empiezan por `/habitos`.
- `App.tsx`: ruta `/habitos/:habitId` → `HabitDetail` (lazy).
- **Hoy** (`Today.tsx`): carga `listHabitSkipsInRange(userId, today, today)` y usa
  `habitsDueOn(habits, today, skips)`; la fila de hábito en "Más tarde hoy" muestra el azulejo
  `sm` en vez de la llama genérica. La cuenta "hábitos hechos" del resumen usa el mismo filtro.
- **Agenda** (`Calendar.tsx`): carga saltos del rango visible y pasa el set a `habitsDueOn`; los
  pausados desaparecen solos por `habitAppliesOn`.
- **Detalle de meta** y **Progreso**: siguen compilando con las firmas conservadas; no se
  rediseñan aquí.
- `HabitRow.tsx` (componente viejo de Hoy) queda huérfano: se elimina si nadie lo importa.

## 9. Verificación

`npm run typecheck && npm run lint && npm test && npm run build` en verde. Revisión visual en
Chrome a 393px (marco iframe del scratchpad) en claro y oscuro contra los PNG: Hoy con hábitos
por hacer y hechos, Todos, Archivados (con y sin), primer uso, hoja paso 1–3, detalle. Sin
migración aplicada, la pantalla debe seguir funcionando con los fallbacks (icono/color por área,
sin saltos ni pausas).
