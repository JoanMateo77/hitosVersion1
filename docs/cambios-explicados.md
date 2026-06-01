# Cambios explicados — pase de arreglos de Hito (para aprender)

Guía didáctica de los cambios más importantes que se hicieron sobre la auditoría.
Formato: **dónde** → **diff antes/después** → **por qué** → **qué significa**.
Las líneas `-` son el ANTES, las `+` son el DESPUÉS.

> Para verlo gráfico: `/plannotator-annotate docs/cambios-explicados.md`

---

## 1. Rollback optimista en el plan del día 🔴 (lógica)

**Dónde:** `src/screens/Today.tsx`, función `toggle` (marcar una tarea como hecha).

```diff
  function toggle(task: Task) {
+   const prevStatus = task.status                  // ← guardamos el estado ANTES
    const nextStatus = wasPending ? 'done' : 'pending'
    patchTask(task.id, { status: nextStatus })      // pintamos "hecha" YA (optimista)
    ...
-   void withErrorHandling(async () => {
-     const updated = await setTaskStatus(task.id, nextStatus)
-     patchTask(task.id, updated)
-   })
+   void withErrorHandling(
+     async () => {
+       const updated = await setTaskStatus(task.id, nextStatus)
+       patchTask(task.id, updated)
+     },
+     () => patchTask(task.id, { status: prevStatus }),  // ← si falla, volvemos atrás
+   )
  }
```

**Por qué:** la app pinta la tarea como "hecha" al instante, *antes* de que el
servidor confirme (se siente rápida). Pero si el guardado fallaba (sin internet),
la pantalla quedaba mostrando "hecha" — una mentira: al recargar, la tarea volvía
a pendiente y el usuario sentía que perdió algo. Ahora, si falla, **revertimos** al
estado previo y mostramos el error.

**Qué significa:**
- **Optimistic update:** mostrar el resultado en pantalla *antes* de que el server
  responda, asumiendo que va a salir bien. Como tachar algo de tu lista apenas lo
  decidís, sin esperar confirmación.
- **Rollback:** el "deshacer" cuando esa apuesta sale mal. Guardás el estado
  anterior y, si falla, lo restaurás.

---

## 2. Dejar de "tragarse" los errores 🔴 (type guard)

**Dónde:** archivo nuevo `src/lib/errors.ts` + el `catch` del Wizard y GoalSuggestions.

```diff
+ export function isUniqueViolation(err: unknown): boolean {
+   if (err == null || typeof err !== 'object') return false
+   const code = (err as { code?: unknown }).code
+   if (code === '23505') return true                  // código Postgres de "duplicado"
+   const message = (err as { message?: unknown }).message
+   return typeof message === 'string' && message.toLowerCase().includes('duplicate key value')
+ }
```

```diff
- } catch {
-   // Si ya existía una tarea de esta meta hoy, seguimos igual.
+ } catch (err) {
+   // Solo ignoramos el duplicado; el resto sube.
+   if (!isUniqueViolation(err)) throw err
  }
```

**Por qué:** el `catch {}` vacío atrapaba **todos** los errores y los ignoraba — el
comentario decía "solo el duplicado", pero también se tragaba fallos de red o
permisos. Resultado: la app decía "meta creada" aunque la primera acción **nunca se
guardó**. Ahora: si es el duplicado esperado, seguimos; cualquier otro error, lo
dejamos subir para mostrarlo.

**Qué significa:**
- **`unknown`:** en TypeScript, "no sé qué tipo es esto". Lo que tira un `catch`
  puede ser cualquier cosa, así que TS te obliga a *chequear* antes de usarlo (más
  seguro que `any`).
- **Type guard:** una función que confirma la forma de un valor (acá, "¿este error
  es un duplicado?"). Devuelve `boolean` y te deja actuar con confianza.
- **Código `23505`:** el código de Postgres para "violación de unicidad" —
  intentaste insertar algo que ya existía.

---

## 3. Cerrar y celebrar la meta 🔴 (el corazón del producto)

**Dónde:** `src/screens/Review.tsx`, el botón "Avancé de etapa".

```diff
- {canAdvance && (
-   <button onClick={() => act(async () => {
-     await setGoalMilestone(goal.id, stage + 1)
-     await markGoalReviewed(goal.id)
-     toast('Etapa cumplida. Bien ahí.')
-   })}>Avancé de etapa 🎯</button>
- )}
+ {canAdvance ? (
+   stage + 1 >= milestones.length ? (
+     <button onClick={() => act(async () => {
+       await setGoalMilestone(goal.id, milestones.length)
+       await setGoalStatus(goal.id, 'done')          // ← cierra la meta
+       toast('¡Meta lograda! Recorriste todo el camino. 🎉')
+     })}>Logré la meta 🎉</button>
+   ) : (
+     /* ...avance de etapa normal... */
+   )
+ ) : (
+   <button onClick={() => act(async () => {
+     await setGoalStatus(goal.id, 'done')            // ← camino ya completo: cerrar
+     toast('¡Meta lograda! 🎉')
+   })}>Marcar como lograda 🎉</button>
+ )}
```

**Por qué:** antes, completar la última etapa subía el contador pero **dejaba la meta
`active` para siempre**. Como `goalsDueForReview` solo trae activas, la meta volvía a
pedir revisión **infinitamente** y el usuario nunca podía "terminarla". Ahora, al
completar la última etapa, se marca `done` y se celebra. El ciclo se cierra.

**Qué significa:**
- **Máquina de estados (state machine):** una meta vive en estados (`active`,
  `paused`, `done`, `archived`). El bug era una **transición faltante**: nada la
  llevaba a `done`. Pensar en "¿qué estados hay y cómo se pasa de uno a otro?" evita
  estos huecos.

---

## 4. La acción del día ahora "sabe" en qué etapa estás 🟡 (algoritmo)

**Dónde:** `src/domain/dailyPlan.ts`, función `pickAction`.

```diff
  export function pickAction(goal: Goal, dateISO: string): string {
    const template = getTemplate(goal.templateKey)
-   const index = (dayIndex(dateISO) + hashString(goal.id)) % template.actions.length
-   return template.actions[index]
+   // En la primera etapa: acciones de "arranque"; en etapas avanzadas: las de régimen.
+   const pool =
+     goal.currentMilestone <= 0 && template.kickoffActions?.length
+       ? template.kickoffActions
+       : template.actions
+   const index =
+     (dayIndex(dateISO) + hashString(goal.id) + goal.currentMilestone) % pool.length
+   return pool[index]
  }
```

**Por qué:** antes la acción del día se elegía solo con el id de la meta + el día,
**ignorando en qué etapa estás**. Daba lo mismo el día 1 que el día 80. Ahora, si
recién arrancás (`currentMilestone === 0`), proponemos acciones de **arranque**
("Anotar tu peso de hoy", "Elegir 3 días para entrenar"); y al sumar `currentMilestone`
a la rotación, la acción **evoluciona con tu progreso**.

**Qué significa:**
- **Determinístico:** misma entrada → misma salida, sin azar ni IA. Acá la acción
  del día es una fórmula con el día + un hash de la meta + la etapa. Barato, predecible
  y testeable.
- **Hash:** convertir un texto (el id de la meta) en un número, para "repartir" qué
  acción toca sin que dos metas propongan siempre lo mismo.

---

## 5. Revisión semanal: revisar lo que toca, no todo 🟡 (usar el dominio)

**Dónde:** `src/screens/Review.tsx`.

```diff
- setGoals(gs.filter((g) => g.status === 'active'))
+ setGoals(goalsDueForReview(gs))   // ya existía esta función de dominio
```

**Por qué:** el banner de Today decía "2 metas para revisar" usando `goalsDueForReview`
(que respeta cada cuánto toca revisar cada meta), pero la pantalla de Review recorría
**todas** las activas. Si tenías 7 activas y 2 tocaban, te hacía pasar por las 7. Ahora
ambos usan la **misma** función → el número y lo que revisás coinciden.

**Qué significa:**
- **Capa de dominio:** la lógica "pura" del negocio (qué meta toca revisar, qué acción
  proponer) vive separada de las pantallas, en `src/domain/`. Reusar esa función en
  vez de reescribir el filtro evita que dos partes de la app digan cosas distintas.

---

## 6. Toggles que el lector de pantalla "entiende" 🟡 (accesibilidad)

**Dónde:** Profile, Calendar, etc. (controles tipo segmento y chips).

```diff
- <div className="seg">
-   <button className={active ? 'seg__btn seg__btn--active' : 'seg__btn'}>Una meta</button>
+ <div className="seg" role="group" aria-label="¿Cómo querés trabajar?">
+   <button className={...} aria-pressed={focusMode === 'single'}>Una meta</button>
```

**Por qué:** visualmente el botón "activo" se nota por el color. Pero un lector de
pantalla (para personas ciegas) solo ve color = nada. Sin `aria-pressed` no sabe cuál
está elegido. Ahora cada toggle **anuncia su estado**, y el grupo dice qué es.

**Qué significa:**
- **ARIA:** atributos que le dan *significado* a la UI para tecnologías de asistencia.
  `aria-pressed={true/false}` = "este botón está presionado/no". `role="group"` +
  `aria-label` = "esto es un grupo de opciones llamado X".
- **aria-hidden en emojis:** marcamos los emojis decorativos como ocultos para el
  lector, así no deletrea "cohete" antes del texto.

---

## 7. Contraste legible (WCAG AA) 🟡 (diseño accesible)

**Dónde:** `src/styles/tokens.css`, el color `--text-faint`.

```diff
- --text-faint: #7e8773;   /* 3.5:1 sobre el fondo → ilegible para mucha gente */
+ --text-faint: #646d59;   /* ~4.8:1 → cumple WCAG AA */
```

**Por qué:** ese gris tenue se usa para datos con significado (vencimientos, "Etapa 2
de 4", labels de navegación). Tenía un contraste de 3.5:1 contra el fondo — por debajo
del mínimo legible. Lo oscurecimos hasta ~4.8:1.

**Qué significa:**
- **WCAG AA:** el estándar de accesibilidad web. Para texto chico pide un contraste
  de al menos **4.5:1** entre el texto y su fondo, así se lee con baja visión o sol
  en la pantalla.
- **Ratio de contraste:** un número (de 1:1 a 21:1) que mide qué tan distinto es el
  texto del fondo. Más alto = más legible.

---

## 8. El plan primero 🟡 (jerarquía de UX)

**Dónde:** `src/screens/Today.tsx` — orden del render.

**Por qué:** se apilaban hasta 5 tarjetas de aviso (foco semanal, revisión, meta
olvidada, agenda, modo enfocado) **arriba** del plan del día, empujándolo abajo del
"fold" en el celular. Movimos esos avisos secundarios **debajo** de la lista de tareas.
Regla del producto: *"lo primero es el plan"*.

**Qué significa:**
- **Above the fold:** lo que se ve sin scrollear. Si lo importante (tu plan) queda
  abajo del fold, el usuario cree que no hay nada que hacer.
- **Jerarquía visual:** el orden y peso de los elementos comunican qué es lo más
  importante. Ordenar = decidir prioridades por el usuario.

---

## 📖 Glosario

| Término | En criollo |
|---|---|
| Optimistic update | Mostrar el resultado ya, antes de que el server confirme |
| Rollback | Deshacer si la apuesta optimista falla |
| Type guard | Función que verifica la forma de un valor antes de usarlo |
| `unknown` | "Tipo desconocido" — TS te obliga a chequearlo (más seguro que `any`) |
| Determinístico | Misma entrada → misma salida; sin azar ni IA |
| Capa de dominio | Lógica pura del negocio, separada de las pantallas (`src/domain/`) |
| State machine | Pensar el dato como estados + transiciones permitidas |
| ARIA / aria-pressed | Atributos que dan significado a la UI para lectores de pantalla |
| WCAG AA | Estándar de accesibilidad: texto chico necesita contraste ≥ 4.5:1 |
| Above the fold | Lo que se ve sin scrollear |
| Hash | Convertir un texto en un número para repartir/rotar |

---

*Generado por el comando `/explicar-cambios`. Para anotarlo/comentarlo en una interfaz
gráfica: `/plannotator-annotate docs/cambios-explicados.md`.*
