# Rediseño de Hoy (estilo iOS, acento azul) · Diseño

**Fecha:** 2026-09-21
**Estado:** aprobado por el usuario (mockup entregado en `docs/diseno/2026-09-21-hoy/`)
**Alcance:** Fase 1 = la pantalla Hoy calcada del mockup en claro y oscuro, más los tokens
globales que el mockup impone (tipografía, paleta, radios, barra inferior). Fase 2 = auditoría
breve, pantalla por pantalla, para que el resto de la app adopte la nueva gama (naranja → azul).

## 1. Referencia

- `docs/diseno/2026-09-21-hoy/hoy-claro.png` y `hoy-oscuro.png`: capturas objetivo (393 × 852).
- `docs/diseno/2026-09-21-hoy/hoy-mockup.html`: el HTML del mockup con todos los valores exactos
  (colores, tamaños, pesos, radios, degradados). Es la fuente de verdad ante cualquier duda.
- El design system "modernist" que venía en el export (Archivo, rojo, sin radios) NO aplica: el
  mockup lo ignora salvo por la fuente. Solo se toma la fuente **Archivo**.

## 2. Tokens globales (afectan a toda la app)

### Tipografía
- Una sola familia: `Archivo` (Google Fonts, pesos 400, 500, 600, 700, 800). Reemplaza a
  Fraunces + Manrope en `index.html` y en `--font` / `--font-display` de `tokens.css`.
- Títulos de pantalla: 30px, peso 800, tracking −0.02em, line-height 1.1.
- Kicker de sección: 13px, peso 600, tracking 0.04em, mayúsculas, color muted.
- Números grandes con `font-variant-numeric: tabular-nums`.

### Paleta clara (`[data-theme='claro']`, default)
| Token | Valor |
|---|---|
| `--bg` | `#f2f2f7` |
| `--bg-elev` / `--surface` | `#ffffff` |
| `--surface-2` | `#e5e5ea` |
| `--surface-3` | `#d1d1d6` |
| `--border` | `#d1d1d6` |
| `--border-soft` | `#e5e5ea` |
| `--text` | `#1c1c1e` |
| `--text-muted` | `#6e6e73` |
| `--text-faint` | `#aeaeb2` |
| `--primary` | `#5b6cff` |
| `--primary-strong` | `#4f5fe0` |
| `--primary-soft` | `rgba(91, 108, 255, 0.12)` |
| `--primary-tint` | `#e6e9ff` (arranque del degradado del héroe) |
| `--success` (texto) | `#1f9d55` |
| `--success-fill` (barras, checks) | `#34c77b` |
| `--shadow-sm` / `--shadow` | `none` (superficie plana; la profundidad la da el contraste) |
| `--shadow-primary` | `0 8px 24px rgba(106, 123, 255, 0.35)` |

### Paleta oscura (`[data-theme='oscuro']`)
| Token | Valor |
|---|---|
| `--bg` | `#000000` |
| `--bg-elev` / `--surface` | `#1c1c1e` |
| `--surface-2` | `#2c2c2e` |
| `--surface-3` | `#3a3a3c` |
| `--border` | `#3a3a3c` |
| `--border-soft` | `#2c2c2e` |
| `--text` | `#ffffff` |
| `--text-muted` | `#8e8e93` |
| `--text-faint` | `#5a5a5f` |
| `--primary` | `#7d8cff` |
| `--primary-strong` | `#aeb7ff` |
| `--primary-soft` | `rgba(125, 140, 255, 0.16)` |
| `--primary-tint` | `#1a1f3a` |
| `--success` (texto) | `#4cd383` |
| `--success-fill` | `#34c77b` |
| `--shadow-sm` / `--shadow` | `none` |
| `--shadow-primary` | `0 8px 24px rgba(106, 123, 255, 0.35)` |

- `--warning`, `--danger`, `--accent` y los `--niche-*` se conservan; `--gradient-brand` pasa a
  `linear-gradient(180deg, #8f9cff 0%, #6a7bff 100%)` (el botón primario del mockup).
- `theme-color` (index.html, `src/app/theme.ts`, manifest en `vite.config.ts`): `#f2f2f7` claro,
  `#000000` oscuro.

### Radios
`--radius-sm: 10px`, `--radius: 14px`, `--radius-lg: 16px`, `--radius-xl: 24px`, `--radius-pill: 999px`.

### Superficies
- `.card` pierde sombra y degradado interno: fondo `--surface`, sin borde visible en claro ni en
  oscuro (el borde queda a `transparent`; el contraste con `--bg` ya separa).
- Botón primario: degradado `--gradient-brand`, radio 14, alto 50, peso 700, sombra
  `--shadow-primary`, texto blanco.

## 3. Barra inferior (global)

- Sin borde superior y sin blur: fondo `linear-gradient(to bottom, transparent, var(--bg) 40%)`
  de 98px de alto que se funde con la página (el contenido pasa por debajo).
- 5 pestañas, íconos de 26px con trazo 2, etiqueta 10px (peso 600 la activa, 500 el resto).
- Activa: `--primary`. Inactivas: `--text-muted`.
- Desaparece la píldora deslizante de fondo (`.bottomnav__inner::before`).

## 4. Pantalla Hoy (móvil, columna única)

Orden vertical exacto del mockup. Separación entre bloques: 14px. Padding lateral: 20px.

### 4.1 Cabecera (reemplaza a la TopBar en `/`)
- La TopBar con la marca no se muestra en Hoy: `AppShell` la omite cuando `pathname === '/'`.
- Izquierda: `h1` "Buenos días / Buenas tardes / Buenas noches, {nombre}" (antes de las 12,
  antes de las 19, resto) y debajo la fecha "Lunes, 21 de septiembre" (15px, muted).
- Derecha: avatar de 40px que navega a `/perfil`, con foto o iniciales (dos letras), fondo
  degradado gris, anillo de 2px del color del marco por racha (o `--primary` si aún no hay marco).
- Nombre: `displayName` nuevo en `SessionValue`, calculado en `App.tsx` desde
  `user.user_metadata.full_name | name` (primera palabra) y, si no hay, desde la parte local del
  email (hasta el primer `.`, `_`, `-` o dígito, capitalizada). Si nada sirve: "Hola" sin nombre.

### 4.2 Tres tarjetas de resumen
Grid de 3 columnas, gap 8, tarjetas radio 16, padding 10/12.
- **Sesiones** `hechas / total` de hoy (cumplidas = done o partial) y una barra segmentada
  (un segmento por sesión, 4px de alto, `--success-fill` las cumplidas).
- **Hábitos** `marcadas / total` donde total = suma de repeticiones de los hábitos que tocan hoy;
  número en `--success` cuando > 0; barra segmentada igual (máximo 12 segmentos; si hay más, la
  barra pasa a proporción continua).
- **Racha** ícono de llama en `--primary` + número + etiqueta en mayúsculas: nombre del marco
  ganado (`frameForStreak`) o, sin marco, "Bronce a los 3".

### 4.3 Tira semanal
7 celdas (LU…DO), radio 14, etiqueta 11px peso 600, número 13px.
- Hoy: fondo `--text` y texto `--bg` (negro sobre claro, blanco sobre oscuro).
- Día con compromiso (pasado o futuro) o con sesiones: fondo `--surface`.
  - Cumplido (`done`): número en `--success`, peso 700. Parcial: número en `--warning`.
  - No cumplido (`missed`): etiqueta y número en `--text-faint`.
- Día sin compromiso (`free`): sin fondo, borde `1px dashed --border-soft`, texto `--text-faint`.
- Tocar un día que no es hoy navega a `/calendario?d=YYYY-MM-DD` (igual que ahora).

### 4.4 "TU SIGUIENTE PASO" (héroe)
Tarjeta radio 24, padding 16, degradado `linear-gradient(160deg, var(--primary-tint) 0%,
var(--surface) 65%)`; en oscuro además `inset 0 0 0 1px rgba(125,140,255,.3)`.
Siempre hay exactamente una tarjeta héroe; su contenido depende del estado, en este orden:

1. **Sesión en curso o en pausa** (`status === 'running'`):
   - Kicker con punto: "SESIÓN EN CURSO" / "SESIÓN EN PAUSA" (12px, 700, `--primary`).
   - Derecha: "{Área corta} · Etapa X de Y" (13px muted). Área corta: Salud, Finanzas, Trabajo,
     Aprendizaje, Relaciones, Crear, Bienestar, Otra. Etapa solo si la meta tiene hitos
     (`milestoneProgressByGoal`); si no, solo el área.
   - Título de la meta (17px, 600) y debajo "Llevas {transcurrido} de {objetivo} comprometidas"
     (tiempo) o "Llevas {n} de {objetivo} {unidad}" (cantidad).
   - Reloj grande a la derecha (40px, 800, tabular): transcurrido en `h:mm` si ≥ 1 h, si no `m:ss`.
     Late cada segundo solo si no está en pausa.
   - Botones: primario "Continuar sesión" (en pausa: reanuda con `resumeSession` y navega a
     `/sesion/:id`; en curso: solo navega) y cuadrado 50×50 con ■ que cierra la sesión con
     `finishSession` (`done` si alcanzó el objetivo, si no `partial`, `actualValue` = minutos o
     cantidad reales) y abre el panel "¿Qué lograste?".
2. **Próxima sesión pendiente** de hoy (la de hora más temprana; sin hora al final):
   - Kicker "SIGUIENTE SESIÓN" + derecha el rango horario o "Sin hora".
   - Título, "{objetivo} comprometidos" (p. ej. "25 min" o "10 páginas") y sin reloj.
   - Botones: primario "Empezar sesión" (navega a `/sesion/:id?start=1`) y cuadrado con ✓ que
     la marca hecha sin cronómetro (comportamiento actual de `quickDone`).
3. **Día cumplido** (todas las sesiones resueltas): kicker "COMPROMISO DE HOY", título
   "Cumpliste tu compromiso de hoy." o "Cerraste el día: X de Y cumplidas." o "Hoy no pudiste.
   Mañana se empieza de nuevo."; botón ghost "Sesión espontánea" (abre el selector de meta).
4. **Sin sesiones hoy y con metas activas**: kicker "DÍA LIBRE", título "Hoy no comprometiste
   sesiones.", botón ghost "Sesión espontánea".
5. **Sin metas**: kicker "EMPIEZA AQUÍ", título "Tu día se arma alrededor de una meta.",
   primario "Ver ideas para empezar" y enlace "Escribir mi propia meta".

### 4.5 Una sola voz (fila de aviso)
Fila radio 16, padding 12/14: cuadrado 34×34 con ícono, título (15px, 600), subtítulo (13px muted)
y chevron. Se conserva la prioridad actual: novedades > celebración > racha rota > sesión sin
confirmar > revisión guiada > meta olvidada. Solo se muestra UNA fila:
- Revisión guiada: "Revisión guiada" / "N metas listas para revisar · 3 min" → `/revision`.
- Sin confirmar: "Quedó una sesión abierta" / "{meta} · ¿Cómo te fue?" → `/sesion/:id`.
- Racha rota: "Tu racha se reinició" / "Récord: N días. Hoy se empieza otra." + botón "Entendido".
- Meta olvidada: "Hace N días sin {meta}" / "¿La retomas o la pausas?" con acciones en fila
  secundaria (Sesión hoy · Pausar · Está bien así).
- Novedades: "Novedades · {título}" / primer ítem; botón "Entendido".
- Celebración (`cheer`): el texto como título, sin subtítulo, se va sola.

### 4.6 "MÁS TARDE HOY"
Cabecera: kicker a la izquierda y a la derecha un botón "+" (ícono, 13px muted) que despliega la
entrada "Agrega algo para hoy…" (Enter guarda). Lista en una sola tarjeta (radio 18) con filas de
56px separadas por una línea `--border-soft` de 1px (sin línea en la última):
- Cuadrado 34×34 radio 10 con ícono: sesión = maletín sobre `--primary-soft`; hábito = llama;
  tarea = check; evento = calendario. Los íconos de sesión en `--primary`, el resto `--text-muted`.
- Título (16px, 500, una línea con elipsis) y subtítulo (13px muted): rango horario o "Sin hora";
  hábitos con repeticiones: "próxima 3:00 pm · 2 de 5".
- Derecha: círculo de 26px, borde 2px `--text-faint`; al marcar se rellena `--success-fill` con
  ✓ blanca. Sesión → `quickDone`; hábito → `toggleHabit`; tarea → `toggleTask`; evento →
  `setEventDone`.
- Orden: por hora de inicio ascendente; sin hora al final. Se excluye la sesión del héroe.
- Los ítems ya hechos se mueven a un `Disclosure` al final: "Hecho hoy · N" (título tachado).
- Tareas pendientes de ayer: primera fila de la lista, ícono de reloj, "N tareas de ayer" /
  "{títulos}", con dos enlaces "Traer" · "Descartar" en vez del círculo.
- Si no hay nada más para hoy y no hay entrada abierta: una fila muted "Nada más por hoy".

### 4.7 Escritorio (≥ 1024px)
Columna única de 560px máximo, centrada; la SideNav y su selector de tema siguen igual. La
distribución en dos columnas (`today-grid` / `today-side`) desaparece.

## 5. Lo que se conserva
- Toda la lógica de datos y acciones de `Today.tsx` (caché por sesión, generación de sesiones,
  cierre de sesiones viejas, backfill, sincronización de zona horaria, optimismo con revert).
- Racha global, `dayState`, marcos por racha, una sola voz, hint de sesión parcial (pasa al
  panel "Hecho hoy").
- Accesibilidad: `aria-label` en cada control, foco visible con `--primary`, zonas táctiles de 44px
  (el círculo de 26px lleva `::after` de 44px como `.check`).

## 6. Fase 2 (después de Hoy): auditoría breve por pantalla
Con los tokens nuevos ya aplicados, cada pantalla se revisa una vez para: quitar restos de
naranja/Fraunces codificados, ajustar radios y sombras a la nueva superficie plana, verificar
contraste en oscuro (fondo negro puro) y que los botones primarios usen el degradado azul.
Orden: Hábitos, Metas y detalle, Agenda, Crecer (Progreso, Aprender), Perfil, Sesión, Revisión,
flujos (Auth, Onboarding, Wizard, Meta creada, Ideas). Sin cambios de estructura en esta fase.

## 7. Verificación
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` en verde.
- Comparación visual con las dos capturas objetivo a 393px de ancho, en claro y en oscuro.
