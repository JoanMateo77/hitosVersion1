# Auditoría C — Íconos · Lógralo

**Rama auditada:** `feat/dieta-fase3` (HEAD `26f28f6`)
**Alcance:** `src/components/icons.tsx` (44 exports), `NicheGlyph.tsx`, `BottomNav.tsx`, `SideNav.tsx`, `TopBar.tsx`, `Disclosure.tsx`, `AgendaBlock.tsx`, `WeekDay.tsx`, `AgendaRow.tsx`, `EventCheck.tsx`, todos los usos en `src/screens/**` y `src/components/**`, y los tokens/reglas de `src/styles/*.css`.
**Método:** lectura estática. Cero ejecución de la app, cero git. Todas las cajas ópticas se derivaron de las coordenadas reales de cada `d=`/`<circle>`/`<rect>`/`points`; las que dependen de arcos (`a`/`A`) van marcadas **aprox.**. Los contrastes se calcularon con la fórmula WCAG 2.x sobre los valores resueltos de `color-mix()`.

**Veredicto de una línea:** el set está bien dibujado y bien pensado —la coherencia de lenguaje (24×24, `currentColor`, caps redondos) ya existe—, pero **no está calibrado**: el trazo renderizado varía 6,4× entre usos, hay 20 tamaños distintos sin escala, tres metáforas están duplicadas (sol, ✕, ✓) y en tema claro los glifos de nicho quedan por debajo del mínimo de contraste. Nada de esto se arregla migrando a Lucide; se arregla con ~8 ediciones quirúrgicas.

**Conteo:** P0 · 0 — P1 · 4 — P2 · 16 — P3 · 10 (30 hallazgos).

---

## 1 · Consistencia técnica del set

### 1.1 La base compartida: lo que SÍ está bien

`src/components/icons.tsx:17-29` define un único `base(size)` que todos los SVG consumen. Eso da, sin excepciones:

| Propiedad | Valor | Cita |
|---|---|---|
| `viewBox` | `0 0 24 24` en los 43 SVG | `icons.tsx:22` |
| `fill` | `none` (el trazo manda) | `icons.tsx:23` |
| `stroke` | `currentColor` | `icons.tsx:24` |
| `strokeLinecap` | `round` | `icons.tsx:26` |
| `strokeLinejoin` | `round` | `icons.tsx:27` |
| `aria-hidden` | `"true"` en los 44 exports | uno por componente |

Esto es más disciplina de la que tienen la mayoría de los sets caseros. **No tocar esta base.** Los problemas están en las tres capas de encima: el peso del trazo, la escala de tamaños y la caja óptica.

### 1.2 `IC-05` · El escalado de trazo hace lo contrario de lo que dice su propio comentario — **P2 / S**

`src/components/icons.tsx:8-9` promete:

> *"El stroke-width se escala con el tamaño — un 2px sobre 16px se ve 'duro' comparado con el mismo 2px sobre 28px. base(size) calibra la línea para que se sienta consistente."*

`src/components/icons.tsx:18`:

```
const strokeWidth = size <= 16 ? 1.6 : size <= 22 ? 1.85 : 2
```

Pero el SVG ya escala el trazo: con `viewBox="0 0 24 24"` y `width=size`, el grosor **renderizado en px CSS** es `strokeWidth × size / 24`. El escalón de `base()` se **multiplica** sobre ese escalado en lugar de compensarlo. Resultado real en los tamaños que usa la app:

| `size=` | strokeWidth | **trazo renderizado (px CSS)** | ejemplo de uso |
|---|---|---|---|
| 11 | 1.6 | **0,73** | `MilestoneChecklist.tsx:99`, `AgendaRow.tsx:130`, `Calendar.tsx:850` |
| 12 | 1.6 | 0,80 | `Goals.tsx:312`, `DayAgenda.tsx:167` |
| 13 | 1.6 | 0,87 | `Today.tsx:567`, `HabitRow.tsx:75` |
| 14 | 1.6 | 0,93 | `Hint.tsx:22`, `Wizard.tsx:336` |
| 15 | 1.6 | 1,00 | `MilestoneChecklist.tsx:132` |
| 16 | 1.6 | 1,07 | `Today.tsx:644/663/679/691` |
| **17** | **1.85** | **1,31** | `Goals.tsx:305`, `TaskItem.tsx:99`, `Habits.tsx:585` |
| 18 | 1.85 | 1,39 | `Goals.tsx:145`, `AgendaBlock.tsx:70` |
| 20 | 1.85 | 1,54 | `SideNav.tsx:97`, `TaskItem.tsx:66` |
| 23 | 2.0 | 1,92 | `BottomNav.tsx:44` |
| 34 | 2.0 | 2,83 | `Goals.tsx:152`, `Habits.tsx:525` |
| 56 | 2.0 | 4,67 | `Review.tsx:136/138` |

Dos consecuencias visibles:

- **Rango 0,73 → 4,67 px: factor 6,4.** Un set "top" mantiene el trazo renderizado dentro de una banda estrecha (Lucide/SF Symbols: prácticamente constante hasta tamaños hero). Aquí el mismo `IconCheck` pasa de 0,73 px en `Calendar.tsx:850` a 2,17 px en `SessionRun.tsx:447`.
- **Escalón duro entre 16 y 17.** +6 % de tamaño produce **+23 % de grosor**. Se nota en pares co-ubicados:
  - `src/screens/Goals.tsx:305` `IconStar size={17}` → 1,31 px, justo encima de `src/screens/Goals.tsx:312` `IconCalendar size={12}` → 0,80 px. **64 % más grueso en la misma tarjeta.**
  - `src/components/MilestoneChecklist.tsx` mezcla tres pesos en una sola fila de etapa: `:99` `IconCalendar size={11}` (0,73 px), `:132/:141` flechas `size={15}` (1,00 px), `:110` `IconDots size={17}` (1,31 px).
  - `src/components/TaskItem.tsx:99` `IconPencil size={17}` (1,31 px) junto a `:102` `IconClose size={18}` (1,39 px) y `:80` `IconCheck size={16}` (1,07 px) — tres pesos en una fila de 3 íconos.

**A 0,73 px de trazo, en pantallas @1x/@2x el borde cae por debajo del píxel** y el navegador lo resuelve con antialias: el ícono se ve gris y difuso en vez de negro y nítido. En @3x (la mayoría de iPhones) sobrevive. *Por verificar en dispositivo* si molesta en @2x; el cálculo dice que sí.

**Fix (IC-05, coste S):** reemplazar `icons.tsx:18` por una regla inversa con techo y piso, que mantiene el trazo renderizado clavado en ~1,4 px hasta `size≈30` y luego lo engorda suavemente para los hero:

```
const strokeWidth = Math.min(2.4, Math.max(1.1, 33.6 / size))
```

Rinde: 14→1,40 px · 16→1,40 · 20→1,40 · 23→1,40 · 24→1,40 · 34→1,56 · 56→2,57. Y actualizar el comentario de `:8-9`, que hoy describe una intención que el código no cumple.

### 1.3 `IC-06` · Veinte tamaños distintos, ocho de ellos consecutivos: no hay escala — **P2 / S**

`grep size={n}` sobre `src/**/*.tsx` devuelve **20 valores**: 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 23, 26, 30, 32, 34, 44, 56, 64, 72, 96. Ocho son enteros seguidos (11–18), lo que delata ajuste a ojo, no sistema.

Peor: **el mismo ícono se usa a tamaños que no se distinguen entre sí**, y el ruido cuesta consistencia sin dar nada a cambio:

| Ícono | Tamaños en uso | Sitios (muestra) |
|---|---|---|
| `IconCheck` | **11, 12, 14, 16, 18, 20, 26** (7) | `Calendar.tsx:850` · `EventCheck.tsx:14` · `Progress.tsx:426` · `TaskItem.tsx:80` · `Review.tsx:265` · `OptionRow.tsx:45` · `SessionRun.tsx:447` |
| `IconPlay` | 11, 13, 14, 16, 18 (5) | `GoalCreated.tsx:122` · `SessionCard.tsx:86` · `AgendaRow.tsx:75` · `AddSheet.tsx:49` · `SessionCard.tsx:120` |
| `IconClose` | 14, 15, 16, 18, 20 (5) | `Hint.tsx:26` · `MilestoneChecklist.tsx:152` · `Habits.tsx:117` · `TaskItem.tsx:102` · `AddSheet.tsx:37` (default) |
| `IconFlame` | 12, 13, 16, 34 (4) | `DayAgenda`-adyacentes · `HabitRow.tsx:75` · `Today.tsx:644` · `Habits.tsx:525` |
| `IconChevronRight` | 14, 16, 18 (3) | `Goals.tsx:193` · `Disclosure.tsx:26` · `AgendaBlock.tsx:70` |
| `IconDots` | 16, 17 (2) | `GoalDetail.tsx:666` vs `Habits.tsx:585` / `MilestoneChecklist.tsx:110` / `MilestonesStep.tsx:114` |
| `IconPencil` | 16, 17 (2) | `Calendar.tsx:601` / `GoalSuggestions.tsx:92` vs `TaskItem.tsx:99` |

Los pares 16/17 y 14/15 son indistinguibles para el ojo pero sí cruzan el umbral de `base()` (16↔17), así que **producen diferencias de grosor sin producir diferencias de tamaño**: lo peor de los dos mundos.

**Fix (IC-06, coste S):** exportar una escala desde `icons.tsx` y prohibir literales sueltos:

```
export const ICON = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, hero: 32 } as const
```

Mapeo sugerido: 11→12 · 13→14 · 15→14 · 17→16 · 18→16 o 20 · 22/23→24 · 26/30→32. Deja 6 escalones en vez de 20 y elimina los cruces de umbral accidentales.

### 1.4 Grilla óptica: la caja real de cada ícono

Cajas derivadas de coordenadas (unidades del `viewBox` de 24). Marcadas **aprox.** las que dependen de arcos.

| Ícono | caja (a×h) | centro | nota |
|---|---|---|---|
| `IconToday` `:31` | 20,0 × 20,0 | (12, 12) | el más grande del set |
| `IconSunrise` `:301` | 20,0 × 19,0 | (12, 11,5) | |
| `IconSun` `:273` | 19,0 × 19,0 | (12, 12) | |
| `IconUsers` `:441` | 19,0 × 15,5 | (12, 12,25) | |
| `IconFlame` `:314` | 13,0 × 19,0 | (12, 12) | |
| `IconGoals` `:40` · `IconClock` `:183` · `IconCompass` `:204` | 18,0 × 18,0 | (12, 12) | **la referencia del set** |
| `IconCalendar` `:133` · `IconShare` `:342` | 18,0 × 18,0 | (12, 11,5) | |
| `IconRoute` `:387` | 16,8 × 18,8 | (12, 12) | |
| `IconCoins` `:410` | 15,0 × 18,4 | (12, 12) | estrecho |
| `IconTimer` `:377` | 15,0 × 18,5 | (12, 11,75) | estrecho |
| `IconLeaf` `:462` | 17,5 × 17,0 | (12,25, 12) | |
| `IconTrash` `:351` | 16,0 × 17,7 | (12, 12,35) | |
| `IconStar` `:143` | 17,0 × 16,2 | (12, 11,6) | |
| `IconPencil` `:91` · `IconBook` `:431` **aprox.** | 18,0 × 16,5–17 | (12, ~12) | |
| `IconHeartPulse` `:400` | 18,0 × 16,5 | (12, 12,25) | ver IC-19 |
| `IconProfile` `:50` | 16,0 × 17,0 | (12, 12,5) | |
| `IconBriefcase` `:421` | 18,0 × 16,0 | (12, 12) | |
| `IconCelebrate` `:242` | 17,0 × 16,0 | (12,5, 12) | |
| `IconAlert` `:261` **aprox.** | ~19 × 17,5 | (12, ~11,8) | |
| `IconMoon` `:282` · `IconBrush` `:452` **aprox.** | ~17 × ~17 | (12, 12) | |
| `IconSprout` `:152` | 13,0 × 15,5 | **(11,5**, 13,25) | 0,5 a la izquierda |
| `IconSparkles` `:100` | 16,0 × 17,0 | **(14,0**, 11,5) | 2,0 a la derecha |
| `IconLightbulb` `:193` **aprox.** | ~12 × 18 | (12, 12) | |
| `IconPlus` `:59` · `IconClose` `:83` | 14×14 / 12×12 | (12, 12) | |
| `IconArrowUp/Down` `:360/:368` | 12,0 × 14,0 | (12, 12) | |
| `IconPlay` `:233` | 11,0 × 14,0 | (12,5, 12) | **único relleno total** |
| `IconCheck` `:67` | 16,0 × 11,0 | (12, 11,5) | |
| `IconArrowReturn` `:214` | 13,0 × 10,0 | (12,5, 11) | |
| `IconFlag` `:173` | 11,0 × 17,0 | **(10,5**, 12,5) | 1,5 a la izquierda |
| `IconBack` `:75` · `IconChevronRight` `:224` | 6,0 × 12,0 | (12, 12) | correcto para chevron |
| `IconPause` `:323` | 6,0 × 13,0 | (12, 12) | |
| **`IconProgress`** `:251` | **18,0 × 10,0** | (12, 11,5) | ver IC-07 |
| **`IconQuote`** `:163` | **14,0 × 8,0** | (11, 12) | ver IC-08 |
| `IconDots` `:332` | 16,2 × 2,2 | (12, 12) | correcto por naturaleza |
| `IconSystem` `:291` | 18,0 × 16,5 | (12, 12,75) | |

**Diagnóstico de grilla:** la mediana está en ~18×17, con una nube sana entre 16 y 19. Los outliers reales son cuatro: `IconQuote` (8 de alto), `IconProgress` (10 de alto), `IconToday` (20×20, el techo), y `IconFlag`/`IconSparkles` descentrados. Ver IC-07, IC-08, IC-26.

### 1.5 `IC-14` · Relleno vs trazo: un solo ícono rompe la regla — **P2 / S**

El set es de trazo puro salvo cuatro `fill="currentColor" stroke="none"`:

| Cita | Qué rellena | Veredicto |
|---|---|---|
| `icons.tsx:45` | punto central de `IconGoals` (r 1,4) | ✅ correcto, detalle mínimo |
| `icons.tsx:266` | punto del `!` de `IconAlert` (r 0,6) | ✅ correcto |
| `icons.tsx:335-337` | los tres puntos de `IconDots` (r 1,1) | ✅ correcto |
| **`icons.tsx:236`** | **el triángulo entero de `IconPlay`** | ⚠️ |

`IconPlay` es el **único ícono 100 % sólido del set**. Su peso óptico es 3–4× el de sus vecinos de trazo, y eso se nota justo donde conviven: `src/screens/calendar/AgendaRow.tsx:75` (`IconPlay size={14}`) y `:79` (`IconChevronRight size={16}`) ocupan **la misma ranura** `.ag-row__aside`. Una fila muestra un triángulo macizo, la de al lado una línea de 1,07 px.

No es necesariamente un error —"play" sólido es convención universal y aquí además va dentro de un disco de color (`.ag-play`, `components.css:3072-3082`)— pero sí exige compensar la ranura (ver IC-13).

### 1.6 Accesibilidad de los íconos

**Lo bueno, y es mucho:** repasé los ~150 sitios de uso. **No encontré un solo botón que tenga un ícono como único rótulo y carezca de nombre accesible.** Muestra verificada: `AddSheet.tsx:36` · `Calendar.tsx:598/604/612/618/946/987/1158/1302/1367/1569` · `GoalDetail.tsx:777` · `GoalSuggestions.tsx:59` · `Wizard.tsx:294` · `Onboarding.tsx:146/206/261/297` · `Learn.tsx:176/327` · `Habits.tsx:114/582` · `TaskItem.tsx:65/77/98/101` · `MilestoneChecklist.tsx:70/82/107/128/137/146` · `MilestonesStep.tsx:88/111/131/140/149` · `SessionCard.tsx:74/84/116/127` · `HabitRow.tsx:49` · `Goals.tsx:291` · `Today.tsx:901` · `EventCheck.tsx:12` · `AgendaRow.tsx:65/100` · `AgendaBlock.tsx:55` · `WeekDay.tsx:46` · `Hint.tsx:25` · `CommitmentStep.tsx:164`. Los `aria-label` además son descriptivos en español, no genéricos ("Marcar repetición 2 de 3 de: …"). **Esto está por encima de la media de la industria; déjenlo como está.**

Dos grietas:

**`IC-17` · `ThemeSwitcher` compacto pierde su rótulo bajo 380 px — P2 / S.**
`src/styles/components.css:1456-1460` esconde `.themeswitch__label` con `display:none` en `@media (max-width: 380px)`. `display:none` **saca el texto del cómputo del nombre accesible**, así que en un iPhone SE (375 px) el botón queda sostenido solo por `title={t.label}` (`src/components/ThemeSwitcher.tsx:50`) — último recurso de la cadena accname y nulo en táctil. **Fix:** añadir `aria-label={t.label}` en `ThemeSwitcher.tsx:44-51`.

**`IC-28` · `aria-hidden="true"` está soldado en los 44 exports, sin escotilla — P3 / S.**
Ningún ícono puede volverse significativo. Cuando hizo falta, hubo que envolverlo: `src/screens/Learn.tsx:380` usa `<span className="check check--done" role="img" aria-label="Lección leída">` alrededor de un SVG `aria-hidden`. Funciona, pero es un parche. **Fix:** aceptar `label?: string` en `IconProps` y emitir `role="img" aria-label={label}` / `aria-hidden="true"` según venga. Coste S, y elimina la necesidad de wrappers futuros.

---

## 2 · Metáforas

### 2.1 Mapa completo: ícono → uso → veredicto

44 exports. Usos contados sobre JSX + referencias como `Icon:` en mapas.

| Ícono | Usos | Dónde (citas) | Veredicto |
|---|---|---|---|
| `IconToday` | 2 | `BottomNav.tsx:15`, `SideNav.tsx:18` | ⚠️ **gemelo de `IconSun`** → IC-01 |
| `IconGoals` | 5 | `BottomNav.tsx:17`, `SideNav.tsx:20`, `Goals.tsx:152`, `NicheGlyph.tsx:30` (nicho "otra"), `:34` (fallback) | ⚠️ tres significados → IC-29 |
| `IconProfile` | 1 | `SideNav.tsx:23` | ✅ (en móvil Perfil vive en el avatar de `TopBar.tsx:58`) |
| `IconPlus` | 8 | `Goals.tsx:145`, `Today.tsx:776/838/902`, `Calendar.tsx:605/989`, `Habits.tsx:411`, `AgendaBlock.tsx:80` | ✅ ejemplar: un significado, un glifo |
| `IconCheck` | 16 | ver §2.3 | ⚠️ 7 tamaños + ausente en 5 `.check` → IC-03, IC-30 |
| `IconBack` | 12 | `GoalDetail.tsx:778`, `Wizard.tsx:295`, `Onboarding.tsx:147/206/261/298`, `Learn.tsx:179/330`, `GoalSuggestions.tsx:60`, `Calendar.tsx:613`, **`Calendar.tsx:620` (espejado)** | ⚠️ → IC-12 |
| `IconClose` | 12 | 7× cerrar hoja + **5× borrar/quitar** | ⚠️ **dos significados, uno destructivo** → IC-02 |
| `IconPencil` | 3 | `Calendar.tsx:601`, `GoalSuggestions.tsx:92`, `TaskItem.tsx:99` | ✅ |
| **`IconSparkles`** | **0** | — | ❌ **huérfano** → IC-09 |
| `IconHito` (logo PNG) | 8 | `TopBar.tsx:54`, `SideNav.tsx:46`, `Auth.tsx:165/178`, `Onboarding.tsx:106`, `UpdatePassword.tsx:44`, `ConfigNeeded.tsx:9`, `ErrorBoundary.tsx:58` | ⚠️ PNG 258 KB a 20 px → IC-20; y ocupa el sitio de `IconAlert` → IC-10 |
| `IconCalendar` | 6 | `BottomNav.tsx:18`, `SideNav.tsx:21`, `Goals.tsx:312`, `GoalDetail.tsx:442`, `Wizard.tsx:528`, `AddSheet.tsx:45`, `MilestonesStep.tsx:104`, `MilestoneChecklist.tsx:99` | ✅ "fecha" y "agenda" son el mismo concepto |
| `IconStar` | 1 | `Goals.tsx:305` (prioridad) | ✅ y el `style={{fill:'currentColor'}}` al activarse es **el patrón correcto** — ver IC-18 |
| `IconSprout` | 3 | `Today.tsx:691`, `Review.tsx:104/138` | ✅ metáfora propia y buena ("meta olvidada que revive") |
| `IconQuote` | 2 | `GoalDetail.tsx:461` ("Tu porqué"), `Today.tsx:679` (revisión) | ✅ significado; ⚠️ dibujo → IC-08 |
| `IconFlag` | 1 | `DayAgenda.tsx:167` (fecha objetivo de meta) | ⚠️ descentrado → IC-26 |
| `IconClock` | 2 | `Today.tsx:663` (sesión abierta), `Onboarding.tsx:271` ("Depende del día") | ✅ vs `IconTimer` |
| `IconLightbulb` | 5 | `Hint.tsx:22`, `Wizard.tsx:336`, `Learn.tsx:256`, `SessionRun.tsx:496`, `Habits.tsx:672` | ⚠️ **3 significados distintos** → IC-11 |
| `IconCompass` | 1 | `GoalDetail.tsx:350` (empty state) | ✅ |
| `IconArrowReturn` | 2 | `TaskItem.tsx:88`, `AgendaRow.tsx:130` | ✅ sustituye bien al `↳` unicode |
| `IconChevronRight` | 8 | `Disclosure.tsx:26`, `AgendaBlock.tsx:70`, `WeekDay.tsx:66`, `AgendaRow.tsx:79`, `Goals.tsx:193`, `Today.tsx:669/685`, `Learn.tsx:384` | ✅ gramática clara: rota = desplegar, fijo = navegar. ⚠️ dos tamaños → IC-25 |
| `IconPlay` | 7 | `SessionCard.tsx:86/120`, `AgendaRow.tsx:75`, `AddSheet.tsx:49`, `SessionRun.tsx:557/591`, `GoalCreated.tsx:122` | ⚠️ peso → IC-14 / IC-13 |
| `IconCelebrate` | 5 | `GoalDetail.tsx:556/706`, `GoalCreated.tsx:86`, `Review.tsx:136`, `SessionRun.tsx:525` | ✅ |
| `IconProgress` | 4 | `BottomNav.tsx:19`, `SideNav.tsx:22`, `Progress.tsx:386`, `Onboarding.tsx:114` | ⚠️ caja 18×10 → IC-07; rótulo → IC-15 |
| **`IconAlert`** | **0** | — | ❌ **huérfano**, y su docstring (`:260`) dice "pantalla de error" → IC-09 / IC-10 |
| `IconSun` | 3 | `ThemeSwitcher.tsx:9`, `Profile.tsx:16`, `Onboarding.tsx:269` | ⚠️ **gemelo de `IconToday`** → IC-01 |
| `IconMoon` | 3 | `ThemeSwitcher.tsx:10`, `Profile.tsx:17`, `Onboarding.tsx:270` | ✅ |
| `IconSystem` | 1 | `ThemeSwitcher.tsx:11` | ✅ |
| `IconSunrise` | 2 | `Profile.tsx:15`, `Onboarding.tsx:268` | ✅ |
| `IconFlame` | 8 | `BottomNav.tsx:16` + `SideNav.tsx:19` (**pestaña Hábitos**) y 6× **racha**: `Today.tsx:567/644`, `Progress.tsx:165/336`, `Habits.tsx:525/575`, `GoalDetail.tsx:645`, `HabitRow.tsx:75` | ⚠️ pestaña ≡ métrica → IC-16 |
| `IconPause` | 1 | `SessionRun.tsx:595` | ✅ |
| `IconDots` | 4 | `GoalDetail.tsx:666`, `Habits.tsx:585`, `MilestoneChecklist.tsx:110`, `MilestonesStep.tsx:114` | ✅ |
| `IconShare` | 1 | `GoalDetail.tsx:725` | ✅ |
| **`IconTrash`** | **0** | — | ❌ **huérfano mientras `IconClose` hace de borrar** → IC-02 |
| `IconArrowUp` / `IconArrowDown` | 2+2 | `MilestoneChecklist.tsx:132/141`, `MilestonesStep.tsx:135/144` | ✅ |
| `IconTimer` | 2 | `Onboarding.tsx:113`, `CommitmentStep.tsx:296` | ✅ |
| `IconRoute` | 1 | `Onboarding.tsx:112` | ⚠️ ver §2.3 (metáfora desaprovechada) |
| `IconHeartPulse` | 1 | `NicheGlyph.tsx:23` (salud) | ⚠️ densidad → IC-19 |
| `IconCoins` / `IconBriefcase` / `IconUsers` / `IconBrush` / `IconLeaf` | 1 c/u | `NicheGlyph.tsx:24/25/27/28/29` | ✅ |
| `IconBook` | 2 | `NicheGlyph.tsx:26`, `Learn.tsx:421` | ✅ |

### 2.2 `IC-01` · `IconToday` e `IconSun` son el mismo dibujo — **P1 / M**

`src/components/icons.tsx:31-38` vs `:273-280`:

```
IconToday:  <circle r="4"  /> + M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 …
IconSun:    <circle r="4.2"/> + M12 2.5v2.4 M12 19.1v2.4 M2.5 12h2.4 M19.1 12h2.4 M5 5l1.7 1.7 …
```

Mismo núcleo circular, mismos 8 rayos en las mismas 8 direcciones. La diferencia es **0,2 unidades de radio y 0,1–0,4 unidades de longitud de rayo**: a 16–23 px eso es literalmente invisible.

El coste no es la duplicación de código, es la **colisión semántica**: la pestaña **"Hoy"** de la barra principal (`BottomNav.tsx:15`, `SideNav.tsx:18`) se dibuja igual que el ícono de **"tema claro"** (`ThemeSwitcher.tsx:9`) y de **"Al mediodía"** (`Onboarding.tsx:269`, `Profile.tsx:16`). Un usuario que acaba de elegir tema en Perfil ve el mismo sol abajo a la izquierda etiquetado "Hoy".

**Fix (dos caminos, elegir uno):**
- **A (recomendado, coste M)** — `IconSun` se queda con la familia de tema/momento del día; **se redibuja `IconToday`**. Propuesta de trazo: *cuadrado redondeado de x 4→20, y 4→20, `rx 4,5`, con un ✓ corto dentro* (`M 8,6 12,3 L 10,9 14,8 L 15,6 9,4`), trazo de la caja igual que el del ✓. Se distingue de `IconCalendar` (que lleva barra de cabecera en y 9,5 y dos anillas en y 2,5) y expresa el verbo central del producto: *el día que se marca*. Riesgo: convive con `IconCheck` — mitigado porque el ✓ aquí **solo** aparece encajonado.
- **B (barato, coste S)** — se mantiene el sol para "Hoy" y se **rellena el núcleo** de `IconSun` (`fill="currentColor" stroke="none"` en el `<circle>`, r 4,6) para el tema claro. Sol lleno = "claro"; sol de contorno = "Hoy". Resuelve la confusión con una línea, aunque deja dos soles en el set.

### 2.3 `IC-02` · La ✕ significa "cerrar" **y** "borrar", con `IconTrash` sin usar — **P1 / S**

`IconClose` (`icons.tsx:83-89`) cubre hoy **dos intenciones opuestas**:

| Intención | Citas |
|---|---|
| **Cerrar / descartar** (no destructivo) | `AddSheet.tsx:37` · `Calendar.tsx:947/1159/1303/1368/1570` · `Hint.tsx:26` |
| **Borrar / quitar** (destructivo) | `TaskItem.tsx:102` (`aria-label` = "Borrar tarea", `TaskItem.tsx:32`) · `MilestoneChecklist.tsx:152` ("Quitar la etapa") · `MilestonesStep.tsx:152` · `Habits.tsx:117` ("Quitar el momento") · `CommitmentStep.tsx:165` ("Quitar este momento") |

Y `IconTrash` está **definido en `icons.tsx:351-358` y usado cero veces**. Es el fallo de vocabulario más caro del set: el usuario aprende que ✕ es inocuo (cierra hojas) y luego se le presenta el mismo glifo para una acción irreversible.

**Fix (coste S):** sustituir `IconClose` por `IconTrash` en los 5 sitios destructivos. La ✕ queda **exclusivamente** para cerrar. Nota fina: en `TaskItem.tsx:101` el rótulo es condicional (`:32` "Saltar por hoy" vs "Borrar tarea"), así que ahí el ícono debe ser condicional también — `IconArrowReturn` o `IconArrowDown` para "saltar", `IconTrash` para "borrar".

### 2.4 `IC-11` · `IconLightbulb` carga tres significados — **P2 / S**

| Cita | Significado real |
|---|---|
| `src/components/Hint.tsx:22` | explicación de primera vez (sistema enseñando) |
| `src/screens/Wizard.tsx:336` | "Ver ideas de metas" (catálogo) |
| `src/screens/Habits.tsx:672` | "Ideas populares" (catálogo) |
| `src/screens/Learn.tsx:256` | "Aplícalo hoy" (llamada a la acción de una lección) |
| `src/screens/SessionRun.tsx:496` | sugerencia algorítmica dentro de la sesión |

Tres conceptos: *tutorial*, *catálogo de ideas*, *sugerencia contextual*. Con `IconSparkles` huérfano al lado, la separación es gratis.

**Fix (coste S):** `IconSparkles` → sugerencia generada (`SessionRun.tsx:496`); `IconLightbulb` → catálogo de ideas (`Wizard.tsx:336`, `Habits.tsx:672`); `Hint.tsx:22` → dejar bombilla **o** `IconCompass`; `Learn.tsx:256` ("Aplícalo hoy") es un imperativo, no una idea → `IconPlay` o `IconCheck` encaja mejor.

### 2.5 Pares que SÍ están bien resueltos (no tocar)

- **`IconClock` vs `IconTimer`** — reloj = *un momento del día* (`Today.tsx:663`, `Onboarding.tsx:271`); cronómetro = *duración medida* (`Onboarding.tsx:113`, `CommitmentStep.tsx:296`). La división es correcta y los dibujos se distinguen (el cronómetro tiene corona en y 2,5 y el círculo bajado a cy 13,5).
- **`IconProgress` vs `IconRoute`** — gráfica = *métrica acumulada*; ruta con paradas = *camino por etapas*. Conviven sin chocar en `Onboarding.tsx:112-114`.
- **`IconHito` vs `IconFlag` vs `IconStar`** — el brief sospechaba colisión; **no la hay**: `IconHito` es el logo de marca (no un hito), `IconFlag` es "fecha objetivo de meta" (`DayAgenda.tsx:167`, 1 uso) y `IconStar` es "prioridad" (`Goals.tsx:305`, 1 uso). Cero solape. *Ojo con el nombre*: `IconHito` no dibuja un hito y puede inducir a error al próximo que lea el set — renombrar a `IconLogo`/`IconBrand` (P3, coste S).

### 2.6 Metáforas que faltan, y las que sobran

**Faltan (acciones que hoy van solo con texto y ganarían ícono):**
- `src/screens/GoalDetail.tsx` no tiene ícono para **pausar/reanudar meta** ni para **archivar**; `IconPause` existe (usado solo en `SessionRun.tsx:595`) y `IconSprout` es exactamente la metáfora de "revivir" que la app ya usa en `Review.tsx:104`.
- Las etapas (`MilestoneChecklist.tsx`) usan `IconArrowUp`/`IconArrowDown` para reordenar; a 15 px eso es correcto, pero **`IconRoute` está desaprovechado**: hoy solo decora el onboarding (`Onboarding.tsx:112`). Es el glifo natural para la cabecera de la sección "El camino" en `GoalDetail`.

**Sobran (ícono redundante junto a texto inequívoco):**
- `src/components/wizard/CommitmentStep.tsx:296` — `<IconTimer size={14} /> Tiempo`. La palabra "Tiempo" no necesita reloj; es un botón de segmento, y el ícono compite con el rótulo en un control ya estrecho.
- `src/screens/GoalDetail.tsx:666` — `<IconDots size={16} /> Más opciones`. Los tres puntos **son** "más opciones"; acompañados del texto, el glifo es ruido. Dejar solo el texto (o solo los puntos con `aria-label`, como se hace bien en `Habits.tsx:582-586`).
- `src/screens/GoalDetail.tsx:556` / `:706` — `IconCelebrate` junto a "Recorriste todo el camino" / "¡Meta lograda!". Dos confetis a pocas líneas de distancia en la misma pantalla diluyen la celebración; dejar uno.

### 2.7 `IC-23` · Restos de la era emoji en el modelo de datos — **P3 / S**

`src/domain/niches.ts:13-20` define `emoji` para los 8 nichos (💪 💰 🚀 📚 🤝 🎨 🌱 🎯) y `src/domain/templates.ts` para las 11 plantillas (`:14, :57, :103, :146, :191, :237, :284, :327, :372, :418, :462`).

**Ninguno se renderiza.** El único `.emoji` que aparece en toda la UI es un comentario (`NicheGlyph.tsx:40`, "ex goal-card__emoji"). `NicheGlyph` los reemplazó por completo (`NicheGlyph.tsx:20-21`). **Cero emoji en strings de UI — la app ya ganó esa batalla.** Queda limpiar el campo muerto de la interfaz `Niche` (`niches.ts:6`) y de las plantillas.

`IC-27` (**P3 / S**): el comentario de `src/styles/components.css:1456` todavía dice *"el control compacto muestra solo el emoji"*; hace tiempo que muestra un ícono.

---

## 3 · Navegación

### 3.1 Estructura

`src/components/BottomNav.tsx:14-20` (móvil, 5 pestañas) y `src/components/SideNav.tsx:17-24` (escritorio, 6) comparten definición y orden. Perfil solo existe en la lateral; en móvil vive en el avatar de `TopBar.tsx:58-77`. **Decisión correcta y bien comentada** (`BottomNav.tsx:10-11`).

| # | Rótulo | Ícono | caja | Título de la pantalla |
|---|---|---|---|---|
| 1 | Hoy | `IconToday` (sol) | **20 × 20** | "Tu día" (`Today.tsx:549/571`) |
| 2 | Hábitos | `IconFlame` | 13 × 19 | "Tus hábitos" (`Habits.tsx:402`) ✅ |
| 3 | Metas | `IconGoals` (diana) | 18 × 18 | "Tus metas" (`Goals.tsx:114/143`) ✅ |
| 4 | Agenda | `IconCalendar` | 18 × 18 | "Tu agenda" (`Calendar.tsx:590`) ✅ |
| 5 | Crecer | `IconProgress` | **18 × 10** | **"Progreso"** (`Progress.tsx:65/145`) / "Aprender" (`Learn.tsx:405`) |

### 3.2 `IC-18` · El activo se distingue solo por color — **P2 / M**

`src/styles/components.css:781-783`: `.bottomnav__item--active { color: var(--primary) }`.
`src/styles/components.css:1739-1748`: pastilla `::before` de 30×30 con `--primary-soft` detrás del ícono de 23 px.

No hay **cambio de peso ni de relleno**: el ícono activo y el inactivo son el mismo trazo, distinto color. Es lo que separa una nav "correcta" de una nav "top" — iOS, Instagram y Things conmutan contorno→relleno, y el ojo lee la silueta antes que el tono. Además, la pastilla deja solo ~3,5 px de halo a cada lado de un ícono de 23 px: es más una sombra que un indicador.

En contraste, **la app ya tiene el patrón correcto en otro sitio**: `src/screens/Goals.tsx:305` rellena `IconStar` con `style={{ fill: 'currentColor' }}` al marcar prioridad. Solo hay que generalizarlo.

**Fix (coste M):** añadir `filled?: boolean` a `IconProps` (`icons.tsx:10-15`) y, en los 5 íconos de pestaña, hacer que `filled` cambie el trazo por relleno:
- `IconToday`: núcleo relleno (r 4), rayos mantienen trazo.
- `IconFlame`: `fill="currentColor"` en la llama exterior, la interior queda en `--on-primary` o se omite.
- `IconGoals`: anillo exterior relleno + anillos internos calados con `fill-rule="evenodd"` (o anillo externo 9 relleno, anillo 5 en `--bg`).
- `IconCalendar`: cuerpo del `rect` relleno bajo la línea y 9,5, cabecera en trazo.
- `IconProgress`: engrosar a `strokeWidth × 1.35` y rellenar la cabeza de flecha (una línea no se puede "rellenar").
Y subir la pastilla a 36×36 con `--radius` (no `--radius-pill`) para que lea como plataforma y no como sombra.

*Nota, baja confianza:* `components.css:1740-1748` posiciona el `::before` con `top: 6px` pero sin `left`/`transform`; el centrado depende de la posición estática de un abspos dentro de un flex `align-items: center`. Los motores actuales lo centran, pero es frágil. **Por verificar en navegador**; si se toca la regla, añadir `left: 50%; transform: translateX(-50%)`.

### 3.3 `IC-07` · `IconProgress` es la mitad de alto que sus vecinos — **P2 / M**

`src/components/icons.tsx:251-258` es la única polilínea del set y su caja es **18 × 10**, contra 20×20, 13×19, 18×18 y 18×18 de sus cuatro compañeras de barra. A 23 px (`BottomNav.tsx:44`) eso son **9,6 px de alto frente a los 19,2 px de `IconToday`**: la quinta pestaña parece apagada aunque tenga el mismo color.

**Fix (coste S–M):** re-dibujar dentro de una caja 18×14 estirando el recorrido en vertical y desplomando más la caída inicial:
```
polyline: 3 17,5 · 9 10,5 · 13 14,5 · 21 5,5
cabeza:   15 5,5 · 21 5,5 · 21 11,5
```
(hoy: `3 16.5 9 10.5 13 14.5 21 6.5` y `15 6.5 21 6.5 21 12.5`). Sube la caja de 10 a 12, y con la cabeza de flecha rellena en estado activo (IC-18) recupera peso.

### 3.4 `IC-15` · El rótulo "Crecer" no coincide con ninguna pantalla — **P2 / S**

`BottomNav.tsx:19` y `SideNav.tsx:22` rotulan la pestaña **"Crecer"** con un ícono de **gráfica ascendente**, pero llevan a `/progreso`, cuyo `<h1>` dice **"Progreso"** (`Progress.tsx:65` y `:145`), y cubren además `/aprender` → **"Aprender"** (`Learn.tsx:405`, `alsoMatch` en `BottomNav.tsx:19`). Tres nombres para una zona; y la gráfica solo describe uno de los dos contenidos.

Las otras cuatro pestañas sí concuerdan ("Hábitos"→"Tus hábitos", "Metas"→"Tus metas", "Agenda"→"Tu agenda"; "Hoy"→"Tu día" es una variación editorial deliberada y aceptable).

**Fix (coste S):** o bien rotular la pestaña "Progreso" y dar a Aprender su propio acceso, o bien mantener "Crecer" y cambiar el `<h1>` de `Progress.tsx:65/145` a "Crecer". La primera es más honesta con el ícono.

### 3.5 `IC-16` · La llama es pestaña **y** métrica — **P2 / S**

`IconFlame` rotula "Hábitos" (`BottomNav.tsx:16`, `SideNav.tsx:19`) y al mismo tiempo es el glifo de **racha** en 6 superficies: `Today.tsx:567`, `Today.tsx:644`, `Progress.tsx:165`, `Progress.tsx:336`, `Habits.tsx:525`, `Habits.tsx:575`, `GoalDetail.tsx:645`, `HabitRow.tsx:75` — siempre dentro de `.streak-chip` (`components.css:506-519`) y siempre seguido de un número.

Es defendible (hábito→racha), pero la llama aparece **tantas veces como cifra** que la pestaña pierde identidad propia: el usuario aprende "llama = número de días", no "llama = sección".

**Fix (coste M, opcional):** dejar `IconFlame` como métrica exclusiva y dar a la pestaña Hábitos un glifo propio de repetición — *dos flechas en bucle cerrado* (arco superior de x 6→18 con punta en 18, arco inferior de x 18→6 con punta en 6, radio 6, centro 12,12) o *tres marcas verticales de altura creciente*. Si se prefiere no tocar, es aceptable dejarlo: la relación semántica existe.

### 3.6 Legibilidad y siluetas a 23 px

A `size={23}` (trazo 1,92 px) los cinco glifos son legibles. Riesgo de silueta: **`IconToday` (círculo central + marcas radiales) vs `IconGoals` (tres círculos concéntricos)** — ambos son "cosa redonda centrada en 12,12" y están en posiciones 1 y 3. No se confunden si se los mira, pero en visión periférica comparten masa. Resolver `IC-01` con la opción A elimina este riesgo de paso; resolverlo con la opción B lo deja igual.

En `SideNav` (`:97`, `size={20}`) el problema desaparece porque el rótulo va **al lado**, no debajo (`components.css:1553-1562`), y se lee antes que el ícono.

---

## 4 · Glifos de nicho (`NicheGlyph`)

### 4.1 Estructura

`src/components/NicheGlyph.tsx:22-31` mapea los 8 nichos a íconos del mismo set, y `:42-55` los envuelve en un disco teñido por `--niche` (`src/lib/nicheAccent.ts:12-15` → `tokens.css:81-88` / `:179-186`).

Tamaños (`NicheGlyph.tsx:49` + `components.css:461-483`):

| variante | caja | ícono | ratio | radio | radio/caja |
|---|---|---|---|---|---|
| `sm` | 26 px | 14 px | 0,538 | `--radius-sm` 9 px | 0,346 |
| `md` | 36 px | 19 px | 0,528 | `--radius` 14 px | **0,389** |
| `lg` | 44 px | 24 px | 0,545 | `--radius` 14 px | **0,318** |

**El ratio ícono/caja es ejemplar** (0,53 ±0,01). **`IC-24` (P3 / S):** el radio no escala — el `md` es proporcionalmente 22 % más redondo que el `lg`. Para un squircle consistente al 0,35: `sm` 9 · `md` 12,5 · `lg` 15,5.

### 4.2 `IC-04` · El tinte no tiene contraste en tema claro — **P1 / M**

`src/styles/components.css:461-470`:
```
background: color-mix(in srgb, var(--niche) 14%, var(--surface-2));
color:      color-mix(in srgb, var(--niche) 78%, var(--text));
```

El problema estructural: **el fondo se tiñe con el MISMO tono que el trazo**, así que la mezcla acerca fondo y figura en vez de separarlos. En oscuro no importa porque `--text` es casi blanco y empuja el trazo hacia arriba; en claro `--text` (`#261d12`) es oscuro pero solo aporta un 22 %.

Contrastes calculados (WCAG 2.x) sobre los valores resueltos:

| Nicho | **CLARO** (`tokens.css:81-88`) | **OSCURO** (`tokens.css:179-186`) |
|---|---|---|
| salud | 3,22 : 1 | 6,41 : 1 |
| **finanzas** | **2,66 : 1** ❌ | 6,87 : 1 |
| carrera | 3,45 : 1 | 5,98 : 1 |
| aprendizaje | 3,93 : 1 | 5,56 : 1 |
| relaciones | 3,32 : 1 | 5,71 : 1 |
| creatividad | 3,60 : 1 | 5,64 : 1 |
| **bienestar** | **2,77 : 1** ❌ | 6,53 : 1 |
| **otra** | **2,90 : 1** ❌ | 6,38 : 1 |

**Tres de ocho no llegan al 3:1 mínimo de WCAG 1.4.11 para objetos gráficos, y los cinco restantes lo rozan.** En oscuro el peor caso es 5,56:1 — el doble. **El tema claro, que es el por defecto (`tokens.css:94-95`), es el que peor se ve.**

Y se agrava con el trazo: en `glyph--sm` el ícono va a 14 px → trazo renderizado **0,93 px** (§1.2). *Una línea de 0,93 px a 2,66:1* (finanzas, tema claro) es la definición de glifo lavado.

**Fix (coste M).** La fórmula verificada numéricamente que arregla los ocho de una vez — bajar el tinte del fondo, apoyarlo en `--surface` (más claro que `--surface-2`) y oscurecer más el trazo:

```css
.glyph {
  background: color-mix(in srgb, var(--niche, var(--text)) 8%, var(--surface));
  color:      color-mix(in srgb, var(--niche, var(--primary)) 55%, var(--text));
}
```

Resultado en tema claro: salud 5,99 · finanzas **5,04** · carrera 6,29 · aprendizaje 6,97 · relaciones 6,03 · creatividad 6,48 · bienestar 5,30 · otra 5,38. **Peor caso 5,04:1** (antes 2,66). Si se teme perder color, la variante 70 %/10 % da un peor caso de 3,68:1 — pasa el mínimo pero con menos margen. En oscuro conviene mantener la fórmula actual (ya rinde 5,5–6,9) tras un `[data-theme='oscuro'] .glyph { … }`, o introducir un token `--niche-ink-*` por tema, que es la solución limpia a largo plazo.

*Nota:* el mismo tinte alimenta puntos y filetes (`.blk__dot` `components.css:3155-3158`, `.wk-day__dot` `:3386-3389`, `.ag-play` `:3076`) usando `--niche` **puro** sobre superficie. Contraste puro/`--surface-2` en claro: finanzas 2,01 · bienestar 2,12 · otra 2,21. Los puntos de 6–7 px del acordeón semanal son casi invisibles en claro. Mismo arreglo, misma causa.

### 4.3 `IC-19` · Distinguibilidad a 14–16 px: siete de ocho, bien; uno se empasta — **P2 / M**

A 14 px (`NicheGlyph size="sm"`) y 16 px (`HabitRow.tsx:58`, `NicheIcon` directo sin disco):

| Nicho | Glifo | Legible a 14 px | Comentario |
|---|---|---|---|
| finanzas | `IconCoins` (elipse + 2 bandas) | ✅ | 3 curvas horizontales, siluetas separadas |
| carrera | `IconBriefcase` | ✅ | rect + asa + divisoria, la más limpia |
| aprendizaje | `IconBook` | ⚠️ | cuerpo + lomo central; a 14 px el lomo casi toca los bordes |
| relaciones | `IconUsers` | ✅ | |
| creatividad | `IconBrush` | ⚠️ | 2 formas orgánicas sueltas — a 14 px comparte masa con `IconLeaf` |
| bienestar | `IconLeaf` | ✅ | 2 curvas, muy legible |
| otra | `IconGoals` | ✅ | pero = pestaña Metas (IC-29) |
| **salud** | **`IconHeartPulse`** | ❌ | ver abajo |

**`IconHeartPulse` es el más denso del set.** `src/components/icons.tsx:404` mete un pulso de **6 segmentos en 10,5 unidades** (`M6.5 12h3l1.5-3 2 5 1.5-2.5h3`) **dentro** del corazón. A 14 px eso son ~6,1 px de ancho útil para 6 cambios de dirección, con un trazo de 0,93 px: los picos se funden en una mancha. El resto del set gasta 2–4 trazos; este gasta 12 segmentos.

**Fix (coste S):** simplificar el pulso a **3 segmentos** — `M7,5 11,5 h2,5 l1,5 -2,5 l2 4 l1,5 -1,5 h2` reducido a `M8 12 h2,5 l1,5 -2,5 l2 4,5 h3` (subida, bajada, salida). O, más simple todavía: mantener el corazón limpio para `sm` y reservar el pulso para `lg`, vía el `filled`/`detail` prop.

`IC-29` (**P3 / S**): `IconGoals` hace de pestaña "Metas" (`BottomNav.tsx:17`), de empty state de Metas (`Goals.tsx:152`) **y** de nicho "otra" (`NicheGlyph.tsx:30`). Una tarjeta de meta del área "otra" lleva el mismo glifo que la pestaña que la contiene. Dibujar un glifo neutro para "otra" (tres puntos en triángulo, o un rombo abierto) cuesta poco.

---

## 5 · Detalles sueltos, verificados

### `IC-03` · El ✓ aparece en 4 de los 9 `.check` — **P1 / M**

`src/styles/components.css:369-397` define el disco y **está diseñado para llevar un ícono dentro**: `.check { color: transparent }` (`:379`) y `.check--done { color: var(--on-primary) }` (`:396`) — es decir, el ✓ existe siempre y solo se revela al completarse. Pero cinco sitios no le meten hijo:

| Con `IconCheck` dentro | Vacío (solo disco) |
|---|---|
| `EventCheck.tsx:14` (12 px) | `HabitRow.tsx:46-55` |
| `GoalDetail.tsx:627` (16 px) | `Habits.tsx:556-561` |
| `Learn.tsx:381` (16 px) | `MilestoneChecklist.tsx:70-75` |
| `TaskItem.tsx:80` (16 px) | `AgendaRow.tsx:112` |
| | `SessionCard.tsx:125-128` |

**Consecuencia directa y visible en una sola pantalla:** en la agenda del día, marcar un **evento** (`EventCheck.tsx:14`) produce un disco verde **con palomita**; marcar un **hábito** (`AgendaRow.tsx:112`) produce un disco verde **liso**. Misma fila, misma columna `.ag-row__aside`, dos acabados. Y en `GoalDetail.tsx:627` el hábito **sí** lleva palomita — el mismo objeto de dominio se marca distinto según la pantalla.

**Fix (coste M, ~5 líneas):** insertar `<IconCheck size={16} />` en los cuatro `.check` de 28 px y `<IconCheck size={12} />` en el `.check--sm` de `AgendaRow.tsx:112`. Ojo: `HabitRow.tsx:44-55`, `Habits.tsx:554-561`, `MilestoneChecklist.tsx:68-75` y `SessionCard.tsx:123-128` son botones **auto-cerrados** (`/>`), hay que abrirlos.

`IC-30` (**P3 / S**): `IconCheck` se usa a 7 tamaños (11, 12, 14, 16, 18, 20, 26). Dentro de `.check` (28 px) va a 16 → ratio 0,57; dentro de `.check--sm` (20 px, `components.css:2853-2857`) a 12 → 0,60. Consistente. El desorden está fuera del check.

### `IC-12` · "Siguiente" es un `IconBack` espejado — **P2 / S**

`src/screens/Calendar.tsx:618-621`:
```jsx
<button className="iconbtn" onClick={() => shift(1)} aria-label="Siguiente">
  <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
    <IconBack />
```
`IconChevronRight` (`icons.tsx:224-230`) es **exactamente** ese dibujo, y existe. El espejado con `scaleX(-1)` invierte además la orientación de los `stroke-linejoin` redondeados y rompe cualquier alineación a píxel. **Fix:** `<IconChevronRight size={24} />` y fuera el `<span>` (coste S, 3 líneas).

### `IC-13` · La misma ranura muestra un disco de 34 px o un chevron de 16 px — **P2 / M**

`src/screens/calendar/AgendaRow.tsx:72-82` renderiza en `.ag-row__aside`, según si la sesión es de hoy:
- `.ag-play` — **34 × 34 px**, disco relleno de color de nicho con sombra (`components.css:3072-3082`)
- `.ag-chev` — chevron **16 px** sin caja (`components.css:3083-3086`)

En una lista de 5 sesiones, la columna derecha "salta" entre un botón macizo de 34 px y una línea de 1 px. **Fix (coste S):** dar al chevron la misma huella —
```css
.ag-chev { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; }
```
Opcional para subir nota: disco fantasma (`background: color-mix(in srgb, var(--niche) 10%, transparent)`) en el chevron, para que las dos variantes rimen.

### `IC-08` · `IconQuote` es el glifo más plano del set — **P2 / S**

`src/components/icons.tsx:163-170` ocupa **14 × 8** — 8 unidades de alto sobre 24, el mínimo absoluto del set. A `size={16}` son **5,3 px de altura real**. Comparte la ranura `.today-notice__icon` (`today.css:46-50`, sin caja fija) con `IconFlame` (`Today.tsx:644`, 13×19 → 12,7 px) y `IconClock` (`Today.tsx:663`, 18×18 → 12 px) al **mismo `size={16}`**: tres avisos apilados con íconos de altura 2,4× distinta a la izquierda. Es el defecto óptico más visible de la app, porque los tres se ven juntos.

**Fix (coste S):** estirar a 14×14 — subir el arranque de cada comilla de `y 8` a `y 6` y alargar la cola de `y 16` a `y 18`. Resultado: `M7 6c-2 0-3 1.5-3 3.5C4 12 5.5 14 8 14M8 6l-1 12` (y el par derecho igual desplazado). Refuerzo barato adicional: dar caja fija a la ranura — `.today-notice__icon { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center }` (`today.css:46`), que neutraliza cualquier outlier futuro.

### `IC-26` · `IconFlag` está descentrado 1,5 unidades — **P3 / S**

`icons.tsx:173-180`: mástil en `x=5`, paño hasta `x=16` → centro óptico en **10,5**, no en 12. Dentro de `.ag-chip__flag` (`components.css:3288-3292`, `inline-flex` sin caja) la bandera se apoya a la izquierda del texto. **Fix:** mástil a `x=6,5`, paño a `x=17,5` (`M6.5 21V4` / `M6.5 4h11l-2 3.5L17.5 11H6.5`). Igual para `IconSparkles` (centro 14,0 → desplazar el grupo 2 unidades a la izquierda) si se rescata del limbo.

### `IC-09` / `IC-10` · Tres huérfanos, y uno de ellos hace falta justo donde no está — **P2 / S**

`IconSparkles` (`icons.tsx:100`), `IconAlert` (`icons.tsx:261`) e `IconTrash` (`icons.tsx:351`): **cero usos** en todo `src/`.

Lo llamativo es `IconAlert`: su docstring (`icons.tsx:260`) dice *"Triángulo de alerta — pantalla de error y avisos serios"*, y **la pantalla de error usa el logo de marca**: `src/components/ErrorBoundary.tsx:58` renderiza `<IconHito size={64} animate />` con la animación `celebrate-pop` (`icons.tsx:124`). Un error se anuncia con la marca rebotando en modo celebración.

Matiz justo: el texto de `ErrorBoundary.tsx:60` es *"¡Acabamos de actualizar la app!"* — está tratado deliberadamente como buena noticia, no como error, y el logo encaja con ese tono. Pero el `ErrorBoundary` **captura cualquier excepción**, no solo despliegues; cuando el fallo es real, el usuario ve una celebración. **Fix (coste S):** `IconAlert` con `--warning` para el caso genérico, logo solo si se detecta versión nueva.

### `IC-20` · La marca es un PNG de 258 KB dibujado a 20 px — **P2 / S–M**

`src/components/icons.tsx:113-131`: `IconHito` es un `<img src={logoUrl}>`. `src/assets/logo.png` = **512×512, RGBA, 258 400 bytes**. Se renderiza a:

| Cita | tamaño |
|---|---|
| `TopBar.tsx:54` | **20 px** |
| `SideNav.tsx:46` | **22 px** |
| `ConfigNeeded.tsx:9` | 22 px (default) |
| `UpdatePassword.tsx:44` | 56 px |
| `Onboarding.tsx:106` / `ErrorBoundary.tsx:58` | 64 px |
| `Auth.tsx:178` | 72 px |
| `Auth.tsx:165` | 96 px |

Dos consecuencias:

1. **252 KB en el bundle** para una marca que en la superficie más frecuente (la TopBar, presente en toda la app) mide 20 px. `public/favicon.png` es el **mismo archivo de 258 400 bytes** (`index.html:5`) — un favicon de 512×512 y ¼ MB.
2. **Un `<img>` no responde a `color`.** Hay cuatro sitios que intentan teñirlo y no hacen nada: `components.css:929` (`.brand__mark { color: var(--primary) }`), `components.css:1817-1819` (`.screen--full .brand__mark`, incluido `-webkit-text-fill-color`), `Auth.tsx:164` y `Auth.tsx:177` (`style={{ color: 'var(--primary)' }}`). Es código muerto que sugiere una capacidad inexistente, y significa que **la marca no se adapta a tema claro/oscuro** mientras los 43 íconos vecinos sí.

**Fix (coste S–M):** exportar `logo-96.png` (o `logo.svg` si existe el vector original) y usarlo en los tres sitios ≤24 px; recomprimir `favicon.png` a 96–128 px. Si en algún momento hay un SVG de marca, `IconHito` puede volver al set y recuperar `currentColor`. Borrar los cuatro `color:` inertes en cualquier caso. *El comentario de `icons.tsx:109-112` explica bien por qué el PNG es el original aprobado — la propuesta no lo contradice: es el mismo dibujo, otra resolución.*

`IC-21` (**P3 / S**): `src/styles/components.css:1714` — la flecha del `<select>` es un chevron-down en data-URI con **color hardcodeado `#9fadc9`** (azul-gris) y `stroke-width: 2`. No pertenece al set, no coincide con la paleta cálida en ningún tema, y no cambia con claro/oscuro. **Fix:** `stroke='currentColor'` no funciona en `background-image`; usar `mask-image` + `background-color: var(--text-faint)`, o dos data-URIs con los colores de cada tema.

`IC-22` (**P3 / S**): `src/components/Roadmap.tsx:76` dibuja **un quinto check a mano** (`M x-3.5 y+0.5 L x-0.5 y+3 L x+4 y-2.5`, caja 7,5×5,5) en lugar de reutilizar `IconCheck`. Además `components.css:615-617` pinta el nodo completado con **`--primary` (naranja)**, cuando `tokens.css:3-4` declara la gramática: *"naranja = acción […] verde = logrado (checks, barras, hitos)"*. Los hitos cumplidos del camino son lo único "logrado" de la app que no es verde.

`IC-25` (**P3 / S**): cuatro chevrons, dos tamaños — `.disclosure__chev` 16 (`Disclosure.tsx:26`), `.ag-chev` 16 (`AgendaRow.tsx:79`), `.blk__chev` 18 (`AgendaBlock.tsx:70`), `.wk-day__chev` 18 (`WeekDay.tsx:66`). La **gramática de rotación sí es coherente y está bien**: rota 90° al abrir en los tres desplegables (`components.css:3165-3167`, `:3396-3398`, `:3473-3475`) y se queda fijo cuando navega (`.ag-chev` no rota). Solo unificar el tamaño a 16.

---

## 6 · Top 10 mejoras, por impacto / coste

| # | ID | Qué | Dónde | Instrucción | Sev/Coste |
|---|---|---|---|---|---|
| **1** | IC-03 | **Poner el ✓ en los 5 `.check` que hoy son discos lisos** | `HabitRow.tsx:46-55` · `Habits.tsx:556-561` · `MilestoneChecklist.tsx:70-75` · `AgendaRow.tsx:112` · `SessionCard.tsx:125-128` | Abrir los botones auto-cerrados e insertar `<IconCheck size={16} />` (o `size={12}` en el `--sm` de `AgendaRow.tsx:112`). El CSS ya está listo (`components.css:379` + `:396`). **La corrección con mejor relación impacto/esfuerzo del informe: 5 líneas y desaparece la incoherencia más visible de la app.** | P1 / M |
| **2** | IC-02 | **Devolverle la papelera a las acciones destructivas** | `TaskItem.tsx:102` · `MilestoneChecklist.tsx:152` · `MilestonesStep.tsx:152` · `Habits.tsx:117` · `CommitmentStep.tsx:165` | Cambiar `IconClose` → `IconTrash` (ya existe, `icons.tsx:351`, sin usar). La ✕ queda solo para cerrar hojas. En `TaskItem.tsx:101` hacer el ícono condicional como ya lo es el rótulo (`:32`): `IconArrowDown` para "Saltar por hoy", `IconTrash` para "Borrar tarea". | P1 / S |
| **3** | IC-04 | **Arreglar el contraste de los glifos de nicho en tema claro** | `components.css:461-470` | Cambiar a `background: color-mix(in srgb, var(--niche) 8%, var(--surface))` y `color: color-mix(in srgb, var(--niche) 55%, var(--text))`. Verificado: peor caso pasa de **2,66:1 a 5,04:1**. Mantener la fórmula actual en oscuro con `[data-theme='oscuro'] .glyph { … }` (allí ya rinde 5,5–6,9). Aplicar el mismo criterio a `.blk__dot` (`:3155`) y `.wk-day__dot` (`:3386`), que usan `--niche` puro a 2,0–2,2:1 en claro. | P1 / M |
| **4** | IC-01 | **Deshacer el gemelo sol** | `icons.tsx:31-38` vs `:273-280` | *Opción A (recomendada):* redibujar `IconToday` como **cuadrado redondeado marcado** — caja `x 4→20, y 4→20, rx 4,5`, con un ✓ interior `M 8,6 12,3 L 10,9 14,8 L 15,6 9,4`, mismo grosor que la caja. Se distingue de `IconCalendar` (que lleva barra en y 9,5 y dos anillas en y 2,5) y dice el verbo del producto. *Opción B (1 línea):* rellenar el núcleo de `IconSun` (`fill="currentColor" stroke="none"`, r 4,6) para que "claro" ≠ "Hoy". | P1 / M |
| **5** | IC-05 + IC-06 | **Calibrar trazo y fijar la escala** | `icons.tsx:18` + ~150 call-sites | Sustituir el escalón por `const strokeWidth = Math.min(2.4, Math.max(1.1, 33.6 / size))` → trazo renderizado constante en 1,40 px hasta size 30, y 2,57 px a 56 (hoy: 0,73 → 4,67 px). Exportar `ICON = { xs:12, sm:14, md:16, lg:20, xl:24, hero:32 }` y remapear: 11→12, 13→14, 15→14, 17→16, 18→16/20, 22/23→24, 26/30→32. Corregir el comentario de `:8-9`, que hoy describe lo contrario de lo que hace el código. | P2 / S+M |
| **6** | IC-07 + IC-08 + IC-26 | **Enderezar los tres outliers de la grilla óptica** | `icons.tsx:251-258`, `:163-170`, `:173-180` | `IconProgress` 18×10 → 18×12: `polyline "3 17.5 9 10.5 13 14.5 21 5.5"` + cabeza `"15 5.5 21 5.5 21 11.5"`. `IconQuote` 14×8 → 14×14: subir el arranque de `y 8` a `y 6` y alargar la cola de `y 16` a `y 18`. `IconFlag` centro 10,5 → 12: mástil a `x 6,5`, paño a `x 17,5`. Refuerzo barato: caja fija de 16 px en `.today-notice__icon` (`today.css:46`). | P2 / M |
| **7** | IC-18 | **Que la pestaña activa cambie de peso, no solo de color** | `icons.tsx:10-15` + `BottomNav.tsx:44` + `components.css:781, 1740-1748` | Añadir `filled?: boolean` a `IconProps`. `IconToday`: núcleo relleno. `IconFlame`: llama exterior rellena. `IconGoals`: anillo exterior relleno con `fill-rule="evenodd"`. `IconCalendar`: cuerpo relleno bajo `y 9,5`, cabecera en trazo. `IconProgress`: cabeza de flecha rellena + trazo ×1,35. Subir la pastilla `::before` a 36×36 con `--radius`, y añadir `left:50%; transform:translateX(-50%)` por robustez. El patrón ya existe en `Goals.tsx:305`. | P2 / M |
| **8** | IC-13 + IC-12 | **Igualar la ranura de la agenda y matar el chevron espejado** | `components.css:3083-3086` · `Calendar.tsx:618-621` | `.ag-chev { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center }` para que la columna no salte entre 34 px y 16 px (`AgendaRow.tsx:72-82`). Y reemplazar `<span style={{transform:'scaleX(-1)'}}><IconBack/></span>` por `<IconChevronRight size={24} />`. | P2 / S |
| **9** | IC-09 + IC-10 + IC-11 | **Repartir los huérfanos y desdoblar la bombilla** | `icons.tsx:100/261/351` · `ErrorBoundary.tsx:58` · `SessionRun.tsx:496` · `Learn.tsx:256` | `IconTrash` → ya asignado en #2. `IconAlert` → `ErrorBoundary.tsx:58` con `--warning` cuando el fallo no sea un despliegue (el tono celebratorio actual solo aplica a "actualizamos la app"). `IconSparkles` → sugerencia generada (`SessionRun.tsx:496`), dejando `IconLightbulb` para catálogos de ideas (`Wizard.tsx:336`, `Habits.tsx:672`) y cambiando `Learn.tsx:256` ("Aplícalo hoy", un imperativo) por `IconPlay`. | P2 / S |
| **10** | IC-20 + IC-19 | **Aligerar la marca y desempastar el corazón** | `icons.tsx:113-131` · `assets/logo.png` · `icons.tsx:404` | Exportar `logo-96.png` para `TopBar.tsx:54` (20 px), `SideNav.tsx:46` (22 px) y `ConfigNeeded.tsx:9`; recomprimir `public/favicon.png` (hoy 512×512 / 258 KB). Borrar los cuatro `color:` inertes sobre el `<img>` (`components.css:929`, `:1817-1819`, `Auth.tsx:164`, `:177`). Y simplificar el pulso de `IconHeartPulse` de 6 segmentos a 3 — `M8 12 h2,5 l1,5 -2,5 l2 4,5 h3` — para que sobreviva a los 14 px de `NicheGlyph size="sm"`. | P2 / S–M |

**Bonus baratos (P3, todos coste S):** unificar chevrons a 16 px (IC-25) · escalar el radio de `.glyph` (IC-24) · reutilizar `IconCheck` en `Roadmap.tsx:76` y pintar el nodo cumplido en `--success` (IC-22) · tematizar la flecha del `<select>` (IC-21) · borrar el campo `emoji` muerto de `niches.ts:6/13-20` y `templates.ts` (IC-23) · actualizar el comentario de `components.css:1456` (IC-27) · `label?: string` en `IconProps` (IC-28) · renombrar `IconHito` → `IconBrand` · glifo propio para el nicho "otra" (IC-29) · `aria-label` en el `ThemeSwitcher` compacto (IC-17).

---

## 7 · ¿Migrar a un set estándar (Lucide inline)?

**Recomendación: mantener el set propio. Robar la disciplina de Lucide, no sus archivos —salvo en una docena de casos puntuales.**

**Por qué no migrar:**
1. **El coste es real y el beneficio nulo para el usuario.** Son ~150 call-sites y 44 exports. Ninguno de los 30 hallazgos de este informe se resuelve migrando: el trazo descalibrado (IC-05) vive en `base()`, no en los paths; los 20 tamaños (IC-06) son de los call-sites; las colisiones semánticas (IC-01, IC-02, IC-11) son decisiones de producto; el contraste de nicho (IC-04) es CSS. **Migrar arreglaría cero P1.**
2. **El set tiene vocabulario propio que Lucide no tiene.** `IconSprout` ("meta olvidada que revive sin culpa", `icons.tsx:151`) y `IconHito` (la marca) no existen en ningún catálogo. Y `IconCompass` para el empty state de una meta (`GoalDetail.tsx:350`) o `IconQuote` para "tu porqué" (`GoalDetail.tsx:461`) son elecciones editoriales que un set genérico empuja hacia lo neutro.
3. **La base ya está bien** (§1.1): `viewBox` único, `currentColor`, caps y joins redondos en los 44. Es el mismo contrato que Lucide. No hay deuda estructural que pagar.
4. **Cero dependencias es una ventaja que ya tienen**, en una PWA móvil donde cada KB del bundle cuenta (y donde el logo ya se come 252 KB, IC-20).

**Qué sí tomar prestado de Lucide (gratis, sin dependencia):**
- **Su regla de caja.** Lucide dibuja todo dentro de un área segura de ~20×20 centrada en el 24×24, con trazo 2 constante. Es exactamente la disciplina que le falta a este set (IC-07, IC-08, IC-26). Adoptarla como norma escrita en el docstring de `icons.tsx` y medir contra ella al añadir íconos.
- **Sus paths, copiados uno a uno, donde el glifo es genérico.** Para `trash-2`, `triangle-alert`, `sparkles`, `chevron-right`, `timer`, `flame`, `briefcase`, `book-open`, `users`, `paintbrush`, `leaf`, `coins` no hay nada que inventar: son formas resueltas hace años, optimizadas a tamaños pequeños. Copiar el `d=` dentro del `base(size)` actual cuesta minutos, no cambia el API, no añade dependencia y sube la calidad de dibujo de los outliers (IC-19 en particular). **Mantener el dibujo propio solo donde la metáfora es del producto** (`IconSprout`, `IconToday` nuevo, `IconHito`, `IconRoute`, `IconGoals`).

En resumen: **el set no necesita ser reemplazado, necesita ser calibrado.** Ocho ediciones (las de #1 a #8 del Top 10) lo llevan de "hecho con cuidado" a "hecho por un equipo con sistema", que es exactamente la distancia que separa una app correcta de una que se siente top.

---

## Anexo · Índice de hallazgos por severidad

| ID | Severidad | Coste | Título | Cita principal |
|---|---|---|---|---|
| IC-01 | **P1** | M | `IconToday` e `IconSun` son el mismo dibujo | `icons.tsx:31-38` / `:273-280` |
| IC-02 | **P1** | S | ✕ significa cerrar y borrar; `IconTrash` sin usar | `TaskItem.tsx:102`, `icons.tsx:351` |
| IC-03 | **P1** | M | El ✓ falta en 5 de los 9 `.check` | `AgendaRow.tsx:112`, `components.css:379` |
| IC-04 | **P1** | M | Glifos de nicho bajo 3:1 en tema claro | `components.css:461-470`, `tokens.css:81-88` |
| IC-05 | P2 | S | `base()` amplifica el trazo en vez de calibrarlo (0,73→4,67 px) | `icons.tsx:8-9, 18` |
| IC-06 | P2 | S | 20 tamaños distintos, sin escala | `Goals.tsx:305/312`, `MilestoneChecklist.tsx:99/110/132` |
| IC-07 | P2 | M | `IconProgress` 18×10 en una barra de vecinos 18–20 de alto | `icons.tsx:251-258`, `BottomNav.tsx:19` |
| IC-08 | P2 | S | `IconQuote` 14×8, el glifo más plano, en ranura compartida | `icons.tsx:163-170`, `Today.tsx:679` |
| IC-09 | P2 | S | 3 íconos huérfanos: Sparkles, Alert, Trash | `icons.tsx:100/261/351` |
| IC-10 | P2 | S | La pantalla de error usa el logo animado, no `IconAlert` | `ErrorBoundary.tsx:58`, `icons.tsx:260` |
| IC-11 | P2 | S | `IconLightbulb` con 3 significados en 5 sitios | `Hint.tsx:22`, `SessionRun.tsx:496`, `Learn.tsx:256` |
| IC-12 | P2 | S | "Siguiente" es `IconBack` espejado con `scaleX(-1)` | `Calendar.tsx:618-621` |
| IC-13 | P2 | M | Misma ranura: disco de 34 px vs chevron de 16 px | `AgendaRow.tsx:72-82`, `components.css:3072-3086` |
| IC-14 | P2 | S | `IconPlay` es el único ícono totalmente relleno | `icons.tsx:236` |
| IC-15 | P2 | S | Pestaña "Crecer" → pantallas "Progreso" / "Aprender" | `BottomNav.tsx:19`, `Progress.tsx:65` |
| IC-16 | P2 | S | `IconFlame` es pestaña y métrica de racha a la vez | `BottomNav.tsx:16` + 6 sitios de racha |
| IC-17 | P2 | S | `ThemeSwitcher` compacto sin nombre accesible ≤380 px | `components.css:1456`, `ThemeSwitcher.tsx:50` |
| IC-18 | P2 | M | Pestaña activa solo por color, sin cambio de peso | `components.css:781, 1740-1748` |
| IC-19 | P2 | M | `IconHeartPulse`: 6 segmentos en 10,5 u, ilegible a 14 px | `icons.tsx:404`, `NicheGlyph.tsx:49` |
| IC-20 | P2 | S–M | Marca = PNG 512×512 / 258 KB dibujado a 20 px; 4 `color:` muertos | `icons.tsx:113-131`, `components.css:929/1817` |
| IC-21 | P3 | S | Flecha del `<select>`: chevron ajeno con color hardcodeado | `components.css:1714` |
| IC-22 | P3 | S | `Roadmap` dibuja su propio ✓ y pinta "done" en naranja | `Roadmap.tsx:76`, `components.css:615-617` |
| IC-23 | P3 | S | Campo `emoji` muerto en el modelo (8 nichos + 11 plantillas) | `niches.ts:6/13-20`, `templates.ts:14…462` |
| IC-24 | P3 | S | El radio de `.glyph` no escala con la caja | `components.css:471-483` |
| IC-25 | P3 | S | Cuatro chevrons, dos tamaños (16 / 18) | `AgendaBlock.tsx:70`, `Disclosure.tsx:26` |
| IC-26 | P3 | S | `IconFlag` descentrado 1,5 u a la izquierda | `icons.tsx:173-180` |
| IC-27 | P3 | S | Comentario obsoleto: "muestra solo el emoji" | `components.css:1456` |
| IC-28 | P3 | S | `aria-hidden` soldado en los 44 exports, sin escape | `icons.tsx:33` y 43 más, `Learn.tsx:380` |
| IC-29 | P3 | S | `IconGoals` sirve para pestaña, empty state y nicho "otra" | `NicheGlyph.tsx:30`, `BottomNav.tsx:17` |
| IC-30 | P3 | S | `IconCheck` a 7 tamaños distintos | `Calendar.tsx:850` … `SessionRun.tsx:447` |
