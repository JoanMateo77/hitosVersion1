# Auditoría D — Animaciones y sensación premium · "Lógralo"

**Rama auditada:** `feat/dieta-fase3` · **Método:** lectura estática (grep + sed), sin ejecutar la app, sin tocar git.
**Alcance:** `src/styles/*.css` (4.051 líneas) + los 24 componentes/pantallas con motion.

**Cifras del árbol:** 17 `@keyframes`, 37 declaraciones `transition:`, 17 `animation:`, 19 reglas `:active`,
0 usos de `will-change`, 0 usos de `startViewTransition`, 1 uso de `navigator.vibrate`, 0 gestos de arrastre.

**Veredicto de una línea:** el motion existente es correcto de gusto pero está *desconectado de los momentos que
importan*: hay cascadas decorativas que se repiten en cada visita, los tres momentos emocionales del producto
(etapa cumplida, meta lograda, sesión terminada) se entregan como un toast de texto, el bloque de agenda —el
gesto más repetido de la app— aparece de golpe sin transición, y la regla global de `prefers-reduced-motion`
convierte seis animaciones infinitas en estroboscopio. No falta *cantidad* de animación: falta *puntería*.

---

## 1. Inventario del motion actual

### 1.1 Tokens de curva (`src/styles/tokens.css:66-69`)

| Token | Valor | Usos reales |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.25, 1, 0.5, 1)` | **23** |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | **0** (literal hard-coded 3×) |
| `--ease-ios` | `cubic-bezier(0.32, 0.72, 0.18, 1)` | **0** (literal hard-coded 2×) |

No existe **ningún** token de duración (`grep -rn "\-\-dur" src/` → 0 resultados).

### 1.2 Transiciones (propiedad, duración, curva, propósito, reduced-motion)

RM = camino propio de `prefers-reduced-motion`. `global` = solo lo cubre la regla `!important` de `base.css:169`.

| # | Dónde | Propiedad | Dur. | Curva | Propósito | RM |
|---|---|---|---|---|---|---|
| 1 | `components.css:121` `.btn` | transform / background / opacity | 60 / 150 / 150 ms | `ease` | feedback | global |
| 2 | `components.css:188` `.iconbtn` | transform / background | 80 / 150 ms | `ease` | feedback | global |
| 3 | `components.css:230` `.input` | border-color | 150 ms | `ease` | estado | global |
| 4 | `components.css:259` `.option` | border / background / transform | 120/120/60 ms | `ease` | feedback | global |
| 5 | `components.css:380-381` `.check` | background / border / color / transform | 150/150/150/80 ms | `ease` | **estado (clave)** | global |
| 6 | `components.css:496` `.goal-card__star` | color / transform | 150 / 100 ms | `ease` | feedback | global |
| 7 | `components.css:532` `.progress__bar` | width | 300 ms | `ease` | estado | global |
| 8 | `components.css:606` `.roadmap__path--done` | **stroke-dasharray** | 600 ms | `--ease-out` | estado | global |
| 9 | `components.css:613` `.roadmap__circle` | fill / stroke | 250 ms | `--ease-out` | estado | global |
| 10 | `components.css:672` `.roadmap__label-hit` | background | 150 ms | `ease` | hover | global |
| 11 | `components.css:774` `.bottomnav__item` | transform / color | 80 / 150 ms | `ease` | feedback | global |
| 12 | `components.css:1260` `.topbar` | transform | 280 ms | `--ease-out` | continuidad | global |
| 13 | `components.css:1561` `.sidenav__item` | background / color | 120 ms | `ease` | hover | global |
| 14 | `components.css:1623` `.task/.ev/.goal-card` | transform / box-shadow / border | 120/180/150 ms | `ease` | feedback | global |
| 15 | `components.css:1733` `.progress__bar` (override) | width | 450 ms | `cubic-bezier(.22,1,.36,1)` | estado | global |
| 16 | `components.css:1768` `.task--done` | opacity | 200 ms | `ease` | estado | global |
| 17 | `components.css:1865` `.hint__close` | background / color | 120 ms | `ease` | hover | global |
| 18 | `components.css:2052` `.skip-link` | **top** ❌ | 150 ms | `ease` | estado | global |
| 19 | `components.css:2198` `.timeline__card` | border-color / transform | 150 / 80 ms | `ease` | feedback | global |
| 20 | `components.css:2309` `.ring__bar` | stroke-dashoffset | 600 ms | `linear` | **estado (focal)** | **propio** (`2311-2315`) |
| 21 | `components.css:2641` `.learn-card` | transform / shadow / border | 120/180/150 ms | `ease` | feedback | global |
| 22 | `components.css:2677` `.learn-card__bar span` | width | 450 ms | `cubic-bezier(.22,1,.36,1)` | estado | global |
| 23 | `components.css:2693` `.lesson-row` | transform / shadow / border | 120/180/150 ms | `ease` | feedback | global |
| 24 | `components.css:2726` `.lesson-dots span` | **width** ❌ / background | 250 / 200 ms | `--ease-out` / `ease` | estado | global |
| 25 | `components.css:2842` `.ev-sub__title` | color | 150 ms | `--ease-out` | estado | global |
| 26 | `components.css:2960` `.reorg-clear` | color | 150 ms | `--ease-out` | feedback | global |
| 27 | `components.css:3163` `.blk__chev` | transform (rotate) | 200 ms | `--ease-out` | estado | **propio** (`3190-3194`) |
| 28 | `components.css:3394` `.wk-day__chev` | transform (rotate) | 200 ms | `--ease-out` | estado | **propio** (`3410-3414`) |
| 29 | `components.css:3471` `.disclosure__chev` | transform (rotate) | 200 ms | `--ease-out` | estado | **propio** (`3479-3483`) |
| 30 | `today.css:26` `.weekstrip__day` | background / transform | 150 / 120 ms | `--ease-out` | feedback | global |
| 31 | `today.css:52` `button.today-notice` | transform / border | 120 / 150 ms | `--ease-out` | feedback | global |
| 32 | `session-plan.css:58-62` `.session-plan__check` | transform/bg/border/color | 120/150/150/150 ms | `--ease-out` | estado | global |
| 33 | `session-plan.css:92-94` `.session-plan__text` | opacity / color | 150 ms | `--ease-out` | estado | global |

### 1.3 Keyframes / `animation:`

| # | Dónde | Qué anima | Dur. | Curva | Propósito | RM |
|---|---|---|---|---|---|---|
| A | `base.css:145-167` `::view-transition-*(root)` | opacity + translateY 4/6 px | 220 ms | `--ease-out` | continuidad de ruta | global — **pero nunca corre** (§2f) |
| B | `components.css:629` `.roadmap__halo` | scale + opacity, **infinite** | 2400 ms | `ease-in-out` | atención | ❌ estroboscopio en RM |
| C | `components.css:853` `.celebrate-pop` | scale 0.6→1.12→1 + opacity | 450 ms | spring literal | **atención (focal)** | global |
| D | `components.css:887` `.spinner span` ×3 | translateY −6px + opacity, **infinite** | 1200 ms (+140/280 ms delay) | `--ease-out` | carga | ❌ estroboscopio en RM |
| E | `components.css:1096` `.sheet__panel` | translateY 100%→0 | 320 ms | `--ease-ios` literal | continuidad overlay | global |
| F | `components.css:1115` `.sheet__backdrop` | opacity | 220 ms | `ease-out` | continuidad overlay | global |
| G | `components.css:1145` `.skeleton` | **background-position**, infinite | 1400 ms | `ease-in-out` | carga | ❌ estroboscopio en RM |
| H | `components.css:1163/1177/1185` `.skeleton-task__*` ×3 | **background-position**, infinite | 1400 ms | `ease-in-out` | carga | ❌ estroboscopio en RM |
| I | `components.css:1753` `.check--done` | scale 0.8→1.08→1 | 220 ms | spring literal | **feedback (clave)** | global |
| J | `components.css:1889` `.toast` | opacity + translateY 12px | 280 ms | `--ease-out` | acuse de recibo | global |
| K | `components.css:1940` `.cheer` | opacity + translateY −4px | 220 ms | `ease-out` | celebración | **propio** (`1952-1956`, `animation:none`) |
| L | `components.css:2099` `.goal-peek-backdrop` | opacity | 200 ms | `ease-out` | continuidad overlay | global (JS ya bypassa, `Goals.tsx:85`) |
| M | `components.css:2624` `.learn-enter` | opacity + translateY 10px | 400 ms + `--i × 55 ms` | `--ease-out` | decoración | global |
| N | `today.css:15` `.today-enter` | opacity + translateY 8px | 320 ms + `--i × 40 ms` | `--ease-out` | decoración | global |
| O | `session-plan.css:33` `.session-plan__item` | opacity + translateY 8px | 300 ms + `--i × 40 ms` | `--ease-out` | decoración | global |

### 1.4 Motion en JS/TSX

| Dónde | Qué | Notas |
|---|---|---|
| `src/screens/Goals.tsx:63` | `createBlendy({ animation: 'spring' })` | **La única continuidad real de la app**: FLIP tarjeta→peek. |
| `src/screens/Goals.tsx:106-107` | `untoggle(...)` + `setTimeout(finish, 700)` | Salida ~700 ms — **más lenta que la entrada** (viola la regla). |
| `src/screens/Goals.tsx:64, 85` | bypass de reduced-motion → `navigate()` directo | Buen patrón; el único de la app. |
| `src/screens/SessionRun.tsx:248-254` | `navigator.vibrate?.(30)` al llegar al objetivo | **Único háptico del producto.** |
| `src/screens/SessionRun.tsx:225` | `setInterval(…, 1000)` → `setNow` | Tick del anillo (ver §5 y cambio #6). |
| `src/components/TopBar.tsx:29-48` | scroll → `hidden` → `.topbar--hidden` | Correcto: `rAF` + umbral 6 px. |
| `src/hooks/useCheer.ts:16` | `setTimeout(… , 3200)` → `setCheerMessage(null)` | **Desmonta en seco: sin salida.** |
| `src/app/toast.tsx:45-47` | `setTimeout(… , 3200)` → `setCurrent(null)` | **Desmonta en seco: sin salida.** |
| `src/screens/Calendar.tsx:166-169` | `setInterval(…, 60_000)` → `setNow` | Re-render de un componente de 1.690 líneas cada minuto (§5). |

---

## 2. Diagnóstico

### (a) ¿Hay sistema de duración/easing, o valores sueltos? — **P1 / costo M**

**Duraciones: 18 valores distintos, cero tokens.**
`60, 80, 100, 120, 150, 180, 200, 220, 250, 280, 300, 320, 400, 450, 600, 1200, 1400, 2400 ms`
(+ delays `40, 55, 140, 280 ms` + `0.001 ms` de la regla RM).
Hay pares casi idénticos sin razón: `.btn` 60 ms vs `.iconbtn` 80 ms vs `.option` 60 ms vs `.check` 80 ms; `.progress__bar`
declarado **dos veces** con duraciones distintas (`components.css:532` 300 ms `ease` y `components.css:1733`
450 ms `cubic-bezier(.22,1,.36,1)` — gana el segundo; el primero es muerto).

**Curvas: 8 distintas para 3 tokens, y los 3 tokens no cubren lo que se usa.**

| Curva | Usos | Estado |
|---|---|---|
| `ease` (default del navegador) | **39** | Sin token. Es un ease-in-out: arranca lento — se siente blando en feedback táctil. |
| `var(--ease-out)` | 23 | ✅ tokenizada |
| `ease-out` (keyword) | 5 | Sinónimo suelto de la anterior |
| `ease-in-out` | 5 | Solo en infinitas |
| `cubic-bezier(0.34,1.56,0.64,1)` | 3 (`components.css:853`, `1753`, + `Goals.tsx:63` `'spring'`) | **= `--ease-spring`, token con 0 usos** |
| `cubic-bezier(0.32,0.72,0.18,1)` | 2 (`components.css:1096`) | **= `--ease-ios`, token con 0 usos** |
| `cubic-bezier(0.22,1,0.36,1)` | 2 (`1733`, `2677`) | Cuarta curva, sin token |
| `linear` | 1 (`2309`) | Correcto ahí (reloj) |

**Conclusión:** hay *intención* de sistema (tres tokens con comentario) pero la cascada real se escribió a mano. La
mitad de la app corre con la curva por defecto del navegador. Los dos tokens "premium" están muertos.

### (b) Animaciones de propiedades de layout — **P2 / costo S**

Tres, todas menores pero reales:

| Dónde | Propiedad | Por qué importa |
|---|---|---|
| `components.css:2052` `.skip-link` | `transition: top 0.15s` | Anima `top` → layout+paint. Trivial de cambiar a `transform: translateY()`. |
| `components.css:2726` `.lesson-dots span` | `transition: width 0.25s` | 6-20 puntos en fila; cada uno reflow del flex al cambiar de lección. |
| `components.css:532/1733/2677` `.progress__bar` | `transition: width` | Es el patrón clásico; `width` sobre un hijo absoluto dentro de `overflow:hidden` es barato, pero `transform: scaleX()` con `transform-origin: left` es gratis en el compositor. |

Nada anima `height`/`max-height`/`margin` — **porque nada se pliega animado en absoluto** (ver (c)). El problema no
es que se animen mal las propiedades de layout: es que se evitó el plegado animado renunciando a la animación.

### (c) Acciones clave SIN feedback — el núcleo del informe

| Acción | Qué existe hoy | Qué falta exactamente | Sev. |
|---|---|---|---|
| **Marcar check de tarea** | `check-pop` 220 ms spring (`components.css:1753`) + color 150 ms (`380`). El único caso completo. | Sin háptico. `TaskItem.tsx:80` es el **único** `.check` que renderiza `<IconCheck>` dentro — el tick aparece de golpe por `color: transparent → on-primary`, no se dibuja. | P2 |
| **Marcar check de hábito** | `HabitRow.tsx:44-55` el `<button className="check">` está **vacío, sin hijo**. `check--done` pinta `color: var(--on-primary)` sobre nada. | El check del hábito **nunca muestra un ✓**: es un disco verde mudo. Mismo defecto en `MilestoneChecklist.tsx:68-75`, `Habits.tsx:554-561`, `GoalDetail.tsx:615-625`, `AgendaRow.tsx:112`, `SessionCard.tsx:122-129`. Solo `TaskItem`, `EventCheck.tsx:14` y `Learn.tsx:381` tienen icono. | **P1** |
| **Marcar sesión como hecha (quick done)** | `SessionCard.tsx:125` `.check session__quick` (sin icono) → la tarjeta se reemplaza por la variante "cerrada" **en el mismo frame**. `Today.tsx:386-388` dispara `cheer(...)`. | La tarjeta cambia de contenido, de layout interno y de opacidad (`.session--done` → `opacity:.78`, `components.css:2278-2282`) sin ninguna transición. Es el cambio de estado más satisfactorio del producto y hoy es un corte duro. Sin háptico. | **P0** |
| **Completar etapa (milestone)** | `toast('Etapa cumplida.', 'success')` (`GoalDetail.tsx:254`) + `check-pop` + `.mstone--done` (`components.css:2355-2358`, **sin transition**). | El tachado y el `opacity:.6` snapean. El `Roadmap` que está arriba en la misma pantalla **no reacciona**: el `transition: stroke-dasharray 0.6s` (`606`) sí corre si el componente no se remonta — por verificar si `GoalDetail` re-renderiza o remonta el `<Roadmap>`. No hay ningún momento focal. | **P1** |
| **Meta lograda** | `toast('¡Meta lograda! Bien hecho.')` (`GoalDetail.tsx:202`, `Review.tsx:277/306`). | El clímax absoluto del producto = 3,2 s de texto en una píldora de 13 px. `celebrate-pop` existe (`components.css:852`) pero **solo se usa en `GoalCreated.tsx:85`**. | **P0** |
| **Abrir sheet** | `sheet-up` 320 ms `--ease-ios` + `sheet-fade` 220 ms. Correcto y bien calibrado. | — | ✅ |
| **Cerrar sheet** | **Nada.** Los 6 sheets (`Calendar.tsx:720,732,778,801,810,828` + `AddSheet`) son `{cond && <Sheet/>}`: al cerrar desmontan en seco. | El panel y el backdrop desaparecen en 1 frame. Entra en 320 ms, sale en 0. Además `.sheet__panel::before` (`1100-1110`) dibuja un **grabber** que promete arrastre: no hay un solo `onPointerDown`/`onTouchMove` en todo `src/`. Afordancia mentirosa. | **P0** |
| **Expandir bloque de agenda** | `AgendaBlock.tsx:73` `{open && <div className="blk__body">…}`. Solo el chevron rota (`3163`, 200 ms). | El cuerpo (N filas + "Agregar algo a las H:MM") **aparece instantáneo** y empuja todo lo de abajo de golpe. Es el gesto central de la Fase-agenda-por-bloques y no tiene ni una transición. Idéntico en `WeekDay.tsx:69` (`.wk-day__body`) y en `Disclosure.tsx:22` (`<details>` nativo, sin animar). | **P0** |
| **Tocar la cabecera del bloque / del día** | **Nada.** `.blk__head` (`3108-3121`) y `.wk-day__head` (`3317-3329`) no tienen `:active`, ni `transition`, ni `:hover`. | Los dos targets táctiles más grandes de la agenda no acusan recibo del toque. `.ag-row:active {opacity:.7}` (`3095-3098`) al menos existe, pero **sin `transition`** → snap al soltar. | **P1** |
| **Cambiar de pestaña** | `.bottomnav__item:active {scale(.92)}` (778) + color 150 ms. La píldora `--active::before` (`1740-1749`) es un pseudo-elemento distinto por pestaña → **no puede deslizarse**, aparece/desaparece. La ruta cambia sin transición (§f). | Falta la píldora deslizante (el detalle "premium" más barato de una bottom nav) y falta cualquier continuidad entre pantallas. | **P1** |
| **Cambiar de día en la semana** | `WeekDay.tsx:40-43` `setOpen` + `onSelect`. `.wk-day--selected .wk-day__num {text-decoration: underline}` (`3354-3358`), sin `transition`. | El subrayado del día activo aparece/desaparece en seco; nada indica que el contenido de abajo cambió por *tu* toque. En Hoy, `.weekstrip__day` sí tiene `scale(.94)` (`today.css:28`) — pero `--today` (`2393`) no transiciona. | P2 |
| **Terminar sesión** | `navigator.vibrate(30)` (`SessionRun.tsx:252`) al *alcanzar* el objetivo. Al cerrarla: nada. | La vibración es el instinto correcto, pero llega sola: el anillo llega a 100 % con una transición `linear` de 600 ms contra un tick de 1000 ms (§5) y ahí se queda. Cerrar la sesión no tiene ningún momento. | **P1** |
| **Crear meta** | `GoalCreated.tsx:85` `.celebrate-pop` 450 ms spring sobre el icono. Lo mejor que hay. | El `<Roadmap>` de abajo (`GoalCreated.tsx:99-102`) se pinta ya completo: `transition: stroke-dasharray` **no dispara en el primer render**, así que "el camino" nunca se traza. Es el regalo más obvio del producto y está a 6 líneas de distancia. | **P2** |

### (d) Animaciones que sobran o son decoración — **P2 / costo S**

1. **Las tres cascadas de entrada** (`.today-enter`, `.learn-enter`, `.session-plan__item`) se reproducen en
   **cada visita**, no en la primera. `Today.tsx` usa índices 0→6 (`587, 619, 642, 712, 808, 851, 909`):
   320 ms + 6 × 40 ms = **560 ms hasta que la última sección existe**, cada vez que el usuario vuelve a la pestaña
   Hoy. Una app de uso diario se visita decenas de veces al día: eso deja de ser bienvenida y pasa a ser peaje.
   `.learn-enter` es peor: 400 ms + `--i × 55 ms`.
2. **`.roadmap__halo` infinita** (`629`, 2,4 s, `infinite`) + `filter: drop-shadow` en el mismo SVG (`607`).
   Un pulso perpetuo no dirige la atención: la agota. Debería pulsar 2-3 veces al entrar y quedarse quieto.
3. **`@media (prefers-reduced-motion: no-preference) { }` vacío** en `components.css:873-874`, precedido por un
   comentario de 4 líneas (`869-872`) que describe un auto-dibujo del logo que ya no existe. Código muerto.
4. **`.progress__bar` con dos `transition` distintos** (`532` y `1733`) — el primero nunca gana.
5. **`.check--done { animation: check-pop }`** (`1753`): `animation` sobre una clase de estado **también dispara al
   montar**. Al entrar a Hoy con 5 tareas ya hechas, los 5 checks popean solos sin que nadie los toque. El pop
   debe ser respuesta a una acción, no a un render.
6. **Blendy** (`package.json` → `"blendy": "^0.0.1"`) es una dependencia en versión 0.0.1 para **una sola pantalla**,
   y el morph va tarjeta→*peek*, no tarjeta→detalle: el usuario paga dos toques y el segundo (`Goals.tsx:240-242`
   "Abrir meta" → `navigate`) es un corte seco. El efecto se puede reproducir con `view-transition-name` compartido
   sin dependencia (cambio #2).

### (e) El problema de la regla global de reduced-motion — **P0 / costo S**

```css
/* src/styles/base.css:169-176 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

Tres defectos, en orden de gravedad:

1. **Falta `animation-iteration-count: 1 !important`.** Seis animaciones son `infinite`:
   `.skeleton` (`1145`), `.skeleton-task__check` (`1163`), `.skeleton-line` (`1177`), `.skeleton-task__btn` (`1185`),
   `.spinner span` (`887`), `.roadmap__halo` (`629`). Con duración `0.001 ms` e iteraciones infinitas, el ciclo
   completo se recorre **cientos de veces por frame**: el navegador pinta un fotograma arbitrario cada vez →
   **parpadeo/estroboscopio**, exactamente lo contrario de lo que el usuario pidió. Y los skeletons se muestran en
   4 pantallas (`Today:551`, `Goals:116`, `Progress:67`, `Habits:519`) y el spinner en cada `LoadingScreen`.
   Es un riesgo de accesibilidad real (vestibular + fotosensibilidad), no un detalle estético.
2. **Borra el feedback significativo junto con el movimiento espacial.** El `check-pop` (confirmación de "lo
   marcaste"), la transición de color del `.check` (`380`), el `width` de `.progress__bar`, el `stroke-dashoffset`
   del `.ring__bar`, el fundido del `.task--done` — todo pasa a 0,001 ms. La rúbrica pide **reducir el movimiento
   espacial conservando el cambio de estado legible**: quien pide menos movimiento sigue necesitando ver *que algo
   cambió*. Hoy ve saltos duros donde antes había lectura.
3. **Convierte en muertos los cinco bloques RM específicos** que sí están bien pensados
   (`1952` cheer, `2311` ring, `3190` blk__chev, `3410` wk-day__chev, `3479` disclosure__chev): la regla global
   con `!important` ya los cubre. Son intención documentada que el barrido global anula.

También falta `scroll-behavior: auto !important` (no hay `scroll-behavior: smooth` declarado hoy — `useScrollToTop.ts`
por verificar — pero es parte del reset canónico).

### (f) View Transitions: qué cubre y qué no — **P1**

```css
/* src/styles/base.css:142-144 */
@view-transition { navigation: auto; }
```

**`@view-transition { navigation: auto }` es la forma *cross-document* (MPA) de la API.** Solo dispara en
navegaciones de documento completo. Esta app monta `BrowserRouter` (`src/main.tsx:3, 27`) y navega **siempre**
con `useNavigate` / `<NavLink>` — client-side, sin recarga de documento. `grep -rn "startViewTransition"` sobre
todo `src/` → **0 resultados**; `grep -rn "viewTransition"` sobre los `.tsx` → **0 resultados**.

**Conclusión: las View Transitions de ruta nunca se ejecutan.** Son 29 líneas de código muerto:
`base.css:139-167` (la at-rule, los dos `::view-transition-*(root)` y los keyframes `route-fade-out`/`route-fade-in`)
y `components.css:2062-2073` (`view-transition-name: sidenav / topbar / bottomnav`). El comentario de `2062-2064`
—"quedan fuera del cross-fade de root, así no parpadean… lo que el comentario de base.css prometía y antes no
existía"— documenta un arreglo a un problema que nunca ocurrió.

Qué **no** cubre hoy (y seguiría sin cubrir aunque se activaran):
- **lista → detalle con elemento compartido**: `/metas` → `/metas/:id` no comparte ningún `view-transition-name`.
  La única continuidad es el FLIP de Blendy hacia el *peek*, y de ahí al detalle real hay un corte seco
  (`Goals.tsx:240-242`).
- **bloque → expandido**: ni siquiera es una navegación, es un `{open && …}` (`AgendaBlock.tsx:73`).
- **Hoy → sesión** (`Today` → `/sesion/:id`), **agenda → sesión**, **semana → día**: todos cortes secos.
- **cambio de pestaña**: corte seco.

---

## 3. Tesis de motion para Lógralo

1. **Un solo momento focal: "lo lograste".** La app es un registro de esfuerzo; el único instante que merece
   500-800 ms es cuando algo se *cierra*: etapa cumplida, sesión terminada, meta lograda. Un lenguaje, tres escalas:
   check (220 ms) → sesión/etapa (400 ms) → meta (700 ms, pantalla completa). Hoy los tres son un toast de texto.
2. **Continuidad donde el usuario cambia de escala, no en cada ruta.** Tres pares merecen elemento compartido:
   tarjeta de meta → detalle, bloque de agenda → expandido, día de la semana → agenda del día. El resto de las
   navegaciones pueden ser corte limpio: un cross-fade genérico de 220 ms en cada pestaña no añade información.
3. **El feedback es obligatorio, la decoración es opcional.** Todo target táctil acusa recibo en 100-150 ms
   (`scale` + color). Todo plegado se anima en 250-300 ms con `grid-template-rows`. Todo overlay sale más rápido
   de lo que entra (320 ms entra / 200 ms sale). Los checks vibran 10 ms.
4. **Presupuesto:** ninguna entrada de pantalla > 300 ms totales (las cascadas actuales llegan a 560 ms); como
   máximo **una** animación infinita visible a la vez, y ninguna cuando el usuario pidió menos movimiento; motion
   solo con `transform` / `opacity` / `grid-template-rows` / `stroke-dashoffset`.
5. **Reduced-motion reduce, no apaga**: se va el desplazamiento, se queda el color, la opacidad y el estado.

---

## 4. Top 12 cambios (impacto / costo)

> 💎 = "efecto premium por poco costo".

---

### #1 · Arreglar la regla global de `prefers-reduced-motion` — **P0 · costo S**
`src/styles/base.css:169-176`

Añadir `animation-iteration-count` (mata el estroboscopio de los 6 `infinite`) y dejar de borrar el feedback:
reducir solo lo espacial.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;   /* ← lo que falta hoy */
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
  /* El feedback significativo SOBREVIVE: cambia el color/estado, no la posición. */
  .check, .task--done, .progress__bar, .ring__bar, .session-plan__check, .ev-sub__title {
    transition-duration: 150ms !important;
  }
  .check--done, .celebrate-pop { animation: none !important; }  /* sin scale; el color ya informa */
}
```
Después se pueden **borrar** los cinco bloques RM redundantes (`components.css:1952, 2311, 3190, 3410, 3479`).

---

### #2 · 💎 Continuidad real: `view-transition-name` compartido meta → detalle, y borrar el código muerto — **P1 · costo M**
`src/styles/base.css:139-167`, `src/styles/components.css:2062-2073`, `src/screens/Goals.tsx:56-108`, `src/screens/GoalDetail.tsx`

Hoy `@view-transition { navigation: auto }` no corre nunca (§2f). Dos opciones; la segunda es la que recomiendo.

**(a) Activarlo de verdad** con un wrapper de una función (sin dependencias):
```ts
// src/lib/navigateWithTransition.ts
export function withTransition(fn: () => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => void }
  if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn()
  d.startViewTransition(() => { flushSync(fn) })   // flushSync de react-dom
}
```
*(Por verificar: React Router 7 expone `viewTransition` en `<Link>` y en las opciones de `navigate()`; si la
versión instalada lo soporta con `BrowserRouter`, eso es más limpio que el wrapper.)*

**(b) Reemplazar Blendy por el elemento compartido nativo** — quita la dependencia `blendy@0.0.1`, elimina el paso
intermedio del *peek* y da la continuidad completa tarjeta → pantalla de detalle:
```tsx
// Goals.tsx (renderCard) y GoalDetail.tsx (cabecera) — el MISMO nombre en ambas rutas
<li style={{ viewTransitionName: `goal-${goal.id}` } as CSSProperties}>
```
```css
::view-transition-group(*)  { animation-duration: 320ms; animation-timing-function: var(--ease-ios); }
::view-transition-old(root),
::view-transition-new(root) { animation-duration: 200ms; }   /* 220 → 200, y salida más corta */
```
Si no se hace ni (a) ni (b): **borrar** `base.css:139-167` y `components.css:2062-2073` (29 líneas muertas) para
que nadie vuelva a creer que la app tiene transiciones de ruta.

---

### #3 · 💎 Plegar/desplegar de verdad: `grid-template-rows: 0fr → 1fr` — **P0 · costo M**
`src/screens/calendar/AgendaBlock.tsx:73-84`, `src/screens/calendar/WeekDay.tsx:69-73`, `src/components/Disclosure.tsx:22-30`, `src/styles/components.css:3168, 3399, 3476`

El cuerpo se monta/desmonta en seco. `grid-template-rows` **sí es animable** y no toca el layout de los hermanos
más de lo imprescindible. Requiere renderizar siempre el cuerpo (con `hidden`/`inert` cuando está cerrado) en lugar
de `{open && …}`.

```tsx
// AgendaBlock.tsx — reemplaza `{open && <div className="blk__body">…}`
<div className="blk__wrap" data-open={open}>
  <div className="blk__body" id={bodyId} {...(!open && { inert: '' as never })}>…</div>
</div>
```
```css
/* components.css, junto a .blk__body:3168 — mismo patrón para .wk-day__wrap y .disclosure */
.blk__wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 260ms var(--ease-out);
}
.blk__wrap[data-open='true'] { grid-template-rows: 1fr; }
.blk__wrap > * { overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .blk__wrap { transition-duration: 1ms !important; } }
```
Los tres `@media` RM ya existentes para los chevrons (`3190`, `3410`, `3479`) pasan a cubrir también esto.

---

### #4 · 💎 El check: tick dibujado + pop, y ponerle el icono a los 6 que no lo tienen — **P1 · costo S**
`src/styles/components.css:380-398, 1751-1765`; `HabitRow.tsx:44-55`, `MilestoneChecklist.tsx:68-75`, `Habits.tsx:554-561`, `GoalDetail.tsx:615-625`, `AgendaRow.tsx:112`, `SessionCard.tsx:122-129`

Seis de nueve `.check` renderizan un botón **vacío**: `check--done` los deja como un disco verde mudo. Primero
poner `<IconCheck size={16} />` dentro de los seis (es el mismo icono que ya usa `TaskItem.tsx:80`). Después,
dibujar el trazo en lugar de encenderlo de golpe — `IconCheck` es un único `path` `M20 6L9 17l-5-5` (longitud ≈ 23
en el viewBox 24), así que `stroke-dasharray: 24` funciona sin medir nada:

```css
/* components.css, tras .check--done:394 */
.check svg path { stroke-dasharray: 24; stroke-dashoffset: 24; }
.check--done svg path {
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 220ms var(--ease-out) 40ms;   /* entra tras el disco */
}
.check--done { animation: check-pop 200ms var(--ease-spring); }   /* usar el TOKEN, no el literal de 1753 */
@media (prefers-reduced-motion: reduce) {
  .check svg path { stroke-dashoffset: 0; }                       /* el ✓ está, no se dibuja */
}
```
Y arreglar el disparo en montaje (§2d-5): que el `animation` viva en una clase efímera puesta por el `onClick`
(`.check--just-done`, quitada en `onAnimationEnd`), no en `.check--done`.

---

### #5 · Salida de los sheets (y decidir qué hacer con el grabber) — **P0 · costo M**
`src/styles/components.css:1082-1132`; `Calendar.tsx:720, 732, 778, 801, 810, 828`; `AddSheet.tsx:31-33`

Entra en 320 ms y sale en 0 frames. Sin añadir dependencias, con `closing` local y `onAnimationEnd`:

```tsx
// en cada sheet: const [closing, setClosing] = useState(false)
const close = () => setClosing(true)
<div className={`sheet${closing ? ' sheet--closing' : ''}`} role="dialog" aria-modal="true"
     onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget.lastChild) onClose() }}>
```
```css
.sheet--closing .sheet__panel    { animation: sheet-down 220ms var(--ease-ios) forwards; }  /* 320 entra / 220 sale */
.sheet--closing .sheet__backdrop { animation: sheet-fade 160ms ease-in reverse forwards; }
@keyframes sheet-down { to { transform: translateY(100%); } }
```
Además: `.sheet__panel::before` (`1100-1110`) dibuja un grabber de arrastre que **no arrastra** (0 handlers de
puntero en todo `src/`). O se implementa el drag-to-dismiss, o se quita el grabber — una afordancia que miente
cuesta más credibilidad de la que da.

---

### #6 · El anillo de sesión: sincronizar la transición con el tick — **P1 · costo S**
`src/styles/components.css:2309`, `src/screens/SessionRun.tsx:225`, `src/components/SessionRing.tsx:20-27`

`setInterval(…, 1000)` mueve `progress` una vez por segundo, pero `.ring__bar` transiciona en **600 ms `linear`**:
el anillo avanza 0,6 s y se queda quieto 0,4 s — un tartamudeo visible durante toda la sesión, el elemento que el
usuario mira fijo durante 25 minutos.

```css
/* components.css:2309 */
.ring__bar { transition: stroke-dashoffset 1000ms linear; }   /* = al tick: avance continuo */
```
Y al llegar al objetivo (`SessionRun.tsx:240-254`, donde ya está el `vibrate(30)`), cerrar el momento en vez de
dejar el anillo lleno y quieto:
```css
.ring--reached .ring__bar { stroke: var(--success); transition: stroke 400ms var(--ease-out); }
.ring--reached .ring__time { animation: check-pop 320ms var(--ease-spring); }
```

---

### #7 · Feedback táctil en la agenda: `.blk__head`, `.wk-day__head`, `.ag-row` — **P1 · costo S**
`src/styles/components.css:3108-3121, 3317-3329, 3095-3098`

Las dos cabeceras más grandes y más tocadas de la app no tienen `:active`. `.ag-row` sí, pero sin `transition`
(snap al soltar).

```css
.blk__head, .wk-day__head {
  transition: background-color 120ms var(--ease-out), transform 100ms var(--ease-out);
  border-radius: var(--radius-sm);
}
.blk__head:active, .wk-day__head:active {
  background: var(--surface-2);
  transform: scale(0.995);          /* casi imperceptible: la fila es ancha */
}
/* components.css:3095 — que el retorno también se lea */
button.ag-row, .ag-row__open { transition: opacity 120ms var(--ease-out); }
```

---

### #8 · Tokens de duración + retirar el `ease` por defecto — **P1 · costo M**
`src/styles/tokens.css:66-69` (+ barrido por los 4 CSS)

18 duraciones sueltas, `ease` en 39 sitios, y los dos tokens premium (`--ease-spring`, `--ease-ios`) con **cero
usos** mientras sus literales aparecen 5 veces. Cuatro tokens de duración cubren toda la rúbrica:

```css
/* tokens.css, junto a las curvas ya existentes */
--dur-tap: 120ms;    /* acuse de recibo: :active, hover        */
--dur-state: 220ms;  /* cambio de estado: check, color, opacidad */
--dur-layout: 320ms; /* layout / overlay / plegado             */
--dur-focal: 560ms;  /* UNA entrada deliberada                 */
--ease-quint: cubic-bezier(0.22, 1, 0.36, 1);   /* la cuarta curva que ya se usa 2× */
```
Barrido: `ease` → `var(--ease-out)`; `cubic-bezier(0.34,1.56,0.64,1)` (`853`, `1753`) → `var(--ease-spring)`;
`cubic-bezier(0.32,0.72,0.18,1)` (`1096`) → `var(--ease-ios)`; borrar el `transition: width .3s ease` muerto de
`.progress__bar` (`532`).

---

### #9 · 💎 El momento focal que falta: "etapa cumplida" y "meta lograda" — **P1 · costo M**
`GoalDetail.tsx:202, 254`; `Review.tsx:277, 291, 306`; `components.css:852-867` (`celebrate-pop`, hoy solo en `GoalCreated.tsx:85`)

El clímax del producto es un toast de 13 px. `celebrate-pop` ya existe y ya está calibrado (450 ms spring): darle
el trabajo para el que fue escrito, escalonando por peso del logro.

```tsx
// etapa cumplida (GoalDetail.tsx:254) — el check ya popea; que el Roadmap acuse el avance
setCelebrating(m.id)            // clase efímera en el nodo del hito
// meta lograda (GoalDetail.tsx:202 / Review.tsx:306) — overlay focal, 560 ms, se va solo
{won && <div className="won" onAnimationEnd={() => setWon(false)}>
   <span className="celebrate-pop"><IconCelebrate size={64} /></span>
   <strong>¡Meta lograda!</strong>
 </div>}
```
```css
.won { position: fixed; inset: 0; z-index: 200; display: grid; place-content: center; gap: var(--s3);
       background: color-mix(in srgb, var(--bg) 88%, transparent);
       animation: cheer-in 200ms var(--ease-out), cheer-in 200ms var(--ease-out) 2.4s reverse forwards; }
```
Con háptico (`navigator.vibrate?.([12, 40, 12])`) y respetando RM (sin `scale`, solo el fundido).

---

### #10 · 💎 El camino se traza al crear la meta — **P2 · costo S**
`src/components/Roadmap.tsx:60-65`, `src/screens/GoalCreated.tsx:99-102`, `src/styles/components.css:604-608`

El `transition: stroke-dasharray 0.6s` (`606`) **no dispara en el primer render**: en `GoalCreated` el camino ya
está pintado cuando la pantalla aparece. Es el regalo más obvio de la app y falta. Con `@keyframes` en vez de
`transition` se dibuja solo al montar:

```css
/* components.css, junto a .roadmap__path--done:604 */
.roadmap--intro .roadmap__path--base,
.roadmap--intro .roadmap__path--done {
  animation: path-draw 900ms var(--ease-out) both;   /* momento focal: 900 ms es deliberado */
}
@keyframes path-draw { from { stroke-dasharray: 0 100; } }
.roadmap--intro .roadmap__svg-step {
  animation: celebrate-pop 300ms var(--ease-spring) both;
  animation-delay: calc(240ms + var(--i) * 120ms);    /* los hitos aparecen sobre la línea ya trazada */
}
```
Pasar `intro` como prop desde `GoalCreated.tsx:99` (y **solo** desde ahí: en `GoalDetail` el camino no se redibuja).

---

### #11 · Cascadas de entrada: una vez, no en cada visita — **P2 · costo S**
`src/styles/today.css:14-23`, `src/styles/components.css:2622-2632`, `src/styles/session-plan.css:29-41`; `Today.tsx:587-909` (7 índices), `Learn.tsx:193`

560 ms de peaje cada vez que se vuelve a Hoy. Dos arreglos, el segundo mejor:

```css
/* today.css:14 — recortar el presupuesto a la mitad */
.today-enter { animation: today-rise 240ms var(--ease-out) both; animation-delay: calc(var(--i, 0) * 24ms); }
/* 6 × 24 + 240 = 384 ms; hoy son 560 ms */
```
Mejor: que la cascada corra **solo en carga fría** (sin `sessionCache`, que ya se consulta en `Today.tsx:127`) y
no cuando el usuario vuelve con datos cacheados — es ahí donde la entrada informa "esto se acaba de cargar".
Mismo criterio para `.learn-enter` (`2624`, 400 ms + 55 ms/ítem) y `.session-plan__item` (`session-plan.css:33`).

---

### #12 · 💎 Píldora deslizante en la BottomNav + salida del toast/cheer — **P2 · costo S**
`src/styles/components.css:1736-1749, 1889, 1940`; `src/app/toast.tsx:60-64`; `src/hooks/useCheer.ts:16`

**(a)** La píldora activa (`1740-1749`) es un `::before` por pestaña: no puede deslizarse. Un único indicador
absoluto en `.bottomnav__inner`, posicionado con `translateX` según el índice, sí:
```css
.bottomnav__inner { position: relative; --tab: 0; }
.bottomnav__inner::before {
  content: ''; position: absolute; top: 6px; left: 0; width: 20%; height: 30px; z-index: -1;
  background: var(--primary-soft); border-radius: var(--radius-pill);
  transform: translateX(calc(var(--tab) * 100%));
  transition: transform 260ms var(--ease-ios);
}
```
(`--tab` = índice de la pestaña activa, calculable en `BottomNav.tsx:27-48` desde `pathname`; `display:none` con RM.)

**(b)** `toast` (`1889`, entra 280 ms) y `cheer` (`1940`, entra 220 ms) **desmontan en seco** tras 3,2 s
(`toast.tsx:45`, `useCheer.ts:16`). Salida a 160 ms con `data-leaving` puesto 160 ms antes del `setCurrent(null)`:
```css
.toast[data-leaving] { animation: toast-in 160ms ease-in reverse forwards; }
.cheer[data-leaving] { animation: cheer-in 160ms ease-in reverse forwards; }
```

---

### Fuera del top 12 (registrados, menor impacto)

| Hallazgo | Ref. | Sev./costo |
|---|---|---|
| Háptico en checks (`vibrate(10)`) — hoy solo existe en `SessionRun.tsx:252` | `TaskItem:76`, `HabitRow:54`, `AgendaRow:98` | P2 / S 💎 |
| `.skip-link` anima `top` en vez de `transform` | `components.css:2052` | P3 / S |
| `.lesson-dots span` anima `width` (reflow del flex) → `flex-basis` o `scaleX` | `components.css:2726` | P3 / S |
| `.progress__bar` anima `width` → `transform: scaleX()` + `transform-origin: left` | `components.css:1733` | P3 / S |
| `.btn--primary` transiciona `background` de **gradiente a color sólido** (`1662` → `1676`): no interpola, snapea | `components.css:121, 1661-1678` | P3 / S |
| `.seg__btn--active` (ThemeSwitcher) sin `transition` ni indicador deslizante | `components.css:955-958` | P3 / S |
| `.mstone--done` (tachado + `opacity:.6`) sin `transition` | `components.css:2355-2358` | P2 / S |
| `.session--done/partial/missed { opacity:.78 }` sin `transition` | `components.css:2278-2282` | P2 / S |
| `.session__play:active { scale(.96) }` **sin `transition`** (inconsistente con `.btn`/`.iconbtn`) | `components.css:2275-2277` | P3 / S |
| `.ag-gap:active { color }` sin `transition` | `components.css:3264-3266` | P3 / S |
| `@media (prefers-reduced-motion: no-preference) { }` vacío + comentario huérfano | `components.css:869-874` | P3 / S |
| Salida de Blendy (~700 ms, `setTimeout`) **más lenta que la entrada** | `Goals.tsx:106-107` | P2 / S |
| `useScrollToTop` en cambio de ruta: por verificar si salta o desplaza | `src/hooks/useScrollToTop.ts` | P3 / S |

---

## 5. Rendimiento

| # | Efecto | Dónde | Por qué cuesta | Cómo acotarlo | Sev./costo |
|---|---|---|---|---|---|
| R1 | **`backdrop-filter: blur(12px)` + `transform` animado en el mismo nodo** | `.topbar` `components.css:1256` + `transition: transform 280ms` (`1260`), disparado por scroll (`TopBar.tsx:29-48`) | El desenfoque del fondo se recalcula en **cada frame** del deslizamiento, sobre toda la franja de 64 px. En Android de gama media es el peor coste de la app, y ocurre en cada scroll. | `will-change: transform` **solo mientras** `hidden` cambia (añadir/quitar en el `useEffect`), o bajar a `blur(8px)`, o —mejor— quitar el blur del nodo que se mueve y ponerlo en un `::before` fijo hermano. | P1 / M |
| R2 | **Cuatro `background-position` infinitas por skeleton** | `components.css:1145, 1163, 1177, 1185` — `.skeleton-task` tiene 4 nodos animados; `SkeletonList rows={4}` en `Today.tsx:551` → **16 nodos repintando a 1,4 s** | `background-position` **no** se compone en GPU: repinta cada frame. Ocurre justo cuando el hilo principal está ocupado hidratando y pidiendo datos. | Un solo overlay por fila con `transform: translateX(-100%→100%)` (sí compuesto) y `overflow:hidden` en el padre; o `opacity` pulsante en 2 nodos en vez de shimmer en 16. | P2 / M |
| R3 | **`.roadmap__halo` infinita sobre un SVG con `filter: drop-shadow`** | `components.css:629` (2,4 s, `infinite`) + `607` (`drop-shadow` en `.roadmap__path--done`) | Un filtro SVG obliga a rasterizar la capa entera en cada frame del pulso, permanentemente, en `GoalCreated` y `GoalDetail`. | Limitar a `animation-iteration-count: 3` (cumple "dirigir la atención" sin coste perpetuo) y mover el `drop-shadow` a un `<feGaussianBlur>` estático o eliminarlo. | P2 / S |
| R4 | **Estroboscopio de las 6 `infinite` bajo reduced-motion** | `base.css:169-176` sin `animation-iteration-count` | No es solo coste: es un ciclo de animación a frecuencia de frame, con repintado, para el usuario que **pidió menos movimiento**. Coste + accesibilidad. | Cambio #1. | **P0 / S** |
| R5 | **Re-render de `Calendar` completo cada 60 s** | `Calendar.tsx:166-169` `setInterval(…, 60_000)`; el valor solo se usa en **una** línea (`583`, `now: day === today ? now : undefined`) | `Calendar.tsx` tiene **1.690 líneas**; en vista mes se re-renderiza la grilla de 6×7 celdas y se recalculan los `dayProps` de los 42 días para mover una línea "Ahora". | Guardar minutos-desde-medianoche (número, no `Date`) para que el `setState` sea no-op 59 de cada 60 veces si el minuto no cambió; y aislar el consumo en un subcomponente `<AgendaNow/>` con su propio `useState`, para que el tick no cruce el árbol. | P2 / M |
| R6 | **`backdrop-filter: blur(3px)` bajo un FLIP de spring** | `components.css:2098` (`.goal-peek-backdrop`) + `Goals.tsx:63` (`animation: 'spring'`) | El desenfoque se recalcula durante todo el morph de la tarjeta. | Quitar el blur del backdrop (el `color-mix` al 72 % de `2097` ya separa planos) o aplicarlo tras terminar el morph. | P2 / S |
| R7 | **25 `box-shadow` declaradas; `.task/.ev/.goal-card` transicionan `box-shadow` en hover** | `components.css:1623` (`box-shadow 180ms`) + `1628-1634` | Cada frame de hover reproyecta la sombra. En móvil (`@media (hover:hover)` lo excluye) no aplica; en escritorio con listas largas sí. | Aceptable tal como está gracias al guard de `hover:hover`. Si se quiere apurar: dos capas de sombra superpuestas y transicionar `opacity`. | P3 / S |
| R8 | **`will-change` no se usa en ningún sitio** (`grep` → 0) | — | No hay abuso (bien), pero tampoco se promociona la capa en los tres momentos que lo justifican: `.sheet__panel` durante `sheet-up`, `.topbar` durante el deslizamiento, `.blk__wrap` durante el plegado del #3. | Añadirlo **solo** dentro de la clase de estado que dura la animación, nunca en la regla base. | P3 / S |

---

## Resumen por severidad

| | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Diagnóstico §2 | 4 | 6 | 2 | 0 |
| Top 12 §4 | 2 | 5 | 5 | 0 |
| Fuera del top 12 | 0 | 0 | 4 | 9 |
| Rendimiento §5 | 1 | 1 | 4 | 2 |

**Total: 5 P0 · 12 P1 · 15 P2 · 11 P3** (los hallazgos del §2 y del §4 se solapan: el §4 es la ejecución del §2).
