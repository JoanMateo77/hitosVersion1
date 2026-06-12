# Lógralo — Mejoras frescas (análisis 2026-06-12)

> Hallazgos **nuevos**, surgidos de caminar todos los flujos en el código como un usuario. No repiten nada de AUDITORIA.md (mayo) ni de AUDITORIA-2026-06.md: las integraciones entre zonas (hábito↔meta, resumen semanal en Hoy, eventos en el detalle, Learn personalizado) y los arreglos técnicos ya están documentados allí.

## Crítica

### 1. Recuperar contraseña no recupera nada ⚠️
El enlace del email abre la app con sesión iniciada… y ahí termina: **nunca se le pide la contraseña nueva**. No existe manejo del evento `PASSWORD_RECOVERY` ni llamada a `updateUser({ password })` en todo `src/`. El usuario queda dentro esta vez, pero en el próximo login sigue sin saber su contraseña y repite el ciclo.
**Arreglo:** escuchar `PASSWORD_RECOVERY` en `onAuthChange` (services/auth.ts:68) y mostrar una pantalla "Define tu contraseña nueva" antes de soltar al usuario en Hoy. **Esfuerzo: bajo · Impacto: alto.**

## Embudo de entrada (Onboarding → Wizard)

### 2. "Prefiero mirar primero" es una promesa rota
El botón salta el onboarding y deja mirar la app… pero al intentar crear una meta, `RequireOnboarded` lo devuelve al onboarding completo desde cero (App.tsx:140-142). El "experimento" termina en un bucle.
**Arreglo:** que el aviso de Hoy para usuarios sin onboarding diga la verdad ("completa 3 pasos para crear tu primera meta"), o permitir el wizard y pedir los datos del perfil al final. **Bajo · Medio.**

### 3. El área del onboarding y el área del título compiten en silencio
El paso "¿Qué tipo de meta es?" filtra plantillas por el **nicho del perfil**, pero el título ya detectó otra área (Wizard.tsx:199-204 vs 315). Quien eligió "carrera" en el onboarding y escribe "Bajar 5 kg" ve plantillas de carrera con su meta de salud.
**Arreglo:** filtrar por el área detectada del título cuando exista, con hint "detectamos que es de salud — puedes cambiarla". **Bajo · Medio.**

### 4. El wizard nace en área "otra" aunque el perfil sabe más
Sin borrador previo, `area` defaultea a `'otra'` (Wizard.tsx:117) en lugar de `profile.primaryNiche` que el usuario acaba de elegir en el onboarding.
**Arreglo:** una línea — defaultear al nicho del perfil. **Trivial · Bajo-Medio.**

### 5. Cambiar Tiempo ↔ Cantidad borra lo que escribiste
En el paso de compromiso, alternar el tipo de medida resetea todos los valores a defaults (CommitmentStep.tsx:55-64): "60 min los lunes" → cambio a cantidad → vuelvo a tiempo → 25 min.
**Arreglo:** recordar el último valor por tipo, o avisar antes de resetear. **Bajo · Medio.**

### 6. "Meta creada" no dice cuándo empiezas si falta más de una semana
La tarjeta "Tu primera sesión" solo aparece si hay una en los próximos 7 días (GoalCreated.tsx:122-135). Si comprometiste solo domingos y hoy es lunes… silencio: "Ver mi plan de hoy" lleva a un día vacío.
**Arreglo:** mostrar siempre la primera sesión, aunque sea "el domingo 21". **Bajo · Medio.**

### 7. "Personalizada" se esconde justo cuando más se necesita
Si `detectTemplate` no reconoce el título, el paso de plantillas muestra la lista genérica del nicho con "Personalizada" al final — exactamente el caso del usuario cuya meta no encaja en nada.
**Arreglo:** si la detección no tuvo señal, subir "Personalizada (la armo yo)" al tope. **Trivial · Bajo.**

## Ejecución diaria

### 8. El ✓ rápido no deja anotar qué lograste
Cerrar la sesión desde el cronómetro ofrece nota de avance y marcar etapa; el quick-done de Hoy (el camino más usado) no ofrece nada — el diario de la meta se queda sin entradas justo en el flujo más frecuente.
**Arreglo:** toast post-✓ con acción "Anotar qué lograste" (input efímero), sin bloquear. **Bajo · Medio-Alto.**

### 9. Volver a una sesión corriendo no te cuenta qué pasó
El reloj por timestamps sobrevive a cerrar la app (bien), pero al volver tras 40 minutos fuera no hay ninguna señal de "estuviste fuera, el reloj siguió". El usuario puede creer que la app contó mal.
**Arreglo:** si `now - últimoTick > ~2 min` al re-montar, mostrar una línea "El reloj siguió mientras no estabas (+38 min)". **Bajo · Medio.**

### 10. Romper la racha es invisible
Cuando la racha se corta, el chip 🔥 simplemente desaparece de Hoy y de Progreso. Sin mensaje, sin reencuadre. Para el mecanismo emocional central de la app, el silencio es la peor respuesta.
**Arreglo:** un aviso único y amable el primer día tras romperla ("Racha reiniciada. Tu récord sigue siendo 12 días — hoy se empieza otra."). **Bajo · Alto** para retención.

## Agenda y planificación

### 11. La hora preferida del perfil no llega al TimeSheet
Perfil guarda `preferredMoment` y el wizard lo usa para sugerir horas, pero el modal "¿A qué hora te queda cómodo?" de la Agenda abre vacío (Calendar.tsx:524-578).
**Arreglo:** precargar 08:00/13:00/19:00 según el momento preferido, editable. **Trivial · Bajo-Medio.**

### 12. La agenda registra, pero no planifica
Desde el calendario no se puede comprometer nada: ni crear un bloque de compromiso ni una sesión espontánea en un día concreto. Todo nace en el wizard o en Hoy; la agenda solo mira.
**Arreglo:** en el día seleccionado, además de "+ evento", ofrecer "+ sesión para una meta" (reuso de `createSpontaneousSession`, que ya existe). **Medio · Alto** — convierte la agenda en herramienta de planificación semanal.

### 13. El mes esconde la densidad real
Las celdas del mes muestran máximo 3 puntos, sin "+N más". Un día con 6 cosas se ve igual que uno con 3; la sorpresa aparece recién al entrar.
**Arreglo:** un cuarto indicador "+N". **Trivial · Bajo.**

## Revisión y comprensión

### 14. La revisión no permite saltar ni da contexto para decidir
Con 6 metas vencidas, la revisión obliga a decidir las 6 en orden, y para cada una muestra solo el camino estructural — no cuántas sesiones hiciste esta semana ni cuándo fue la última, que es justo lo que necesitas para decidir "¿sigo o pauso?".
**Arreglo:** botón "Saltar esta" (sin marcarla revisada) + una línea de contexto por meta ("3 sesiones esta semana · última el martes" — los datos ya se cargan en otras pantallas). **Bajo-Medio · Alto.**

### 15. Seis estados de sesión sin leyenda
pending / running / done / partial / missed / unconfirmed: las tarjetas los etiquetan bien, pero ningún lugar explica el sistema. El primer "sin confirmar" de un usuario nuevo es un misterio.
**Arreglo:** la primera vez que aparece cada estado raro (parcial, sin confirmar), un hint de una línea descartable — la infraestructura `useFirstTimeHint` ya existe en `src/hooks/`. **Bajo · Medio.**

---

## Priorización sugerida

| # | Mejora | Esfuerzo | Impacto | Orden |
|---|---|---|---|---|
| 1 | Completar recuperación de contraseña | Bajo | Alto | 1º |
| 10 | Mensaje al romper la racha | Bajo | Alto | 2º |
| 8 | Nota de avance tras el ✓ rápido | Bajo | Medio-Alto | 3º |
| 14 | Revisión: saltar + contexto | Bajo-Medio | Alto | 4º |
| 6 | "Meta creada" siempre dice cuándo empiezas | Bajo | Medio | 5º |
| 4, 7, 11, 13 | Cuatro triviales de una línea | Trivial | Bajo-Medio | 6º (juntas) |
| 3, 5 | Wizard: área del título + valores que no se borran | Bajo | Medio | 7º |
| 2 | "Prefiero mirar primero" honesto | Bajo | Medio | 8º |
| 9 | "El reloj siguió sin ti" | Bajo | Medio | 9º |
| 15 | Hints de estados de sesión | Bajo | Medio | 10º |
| 12 | Agenda que planifica | Medio | Alto | cuando haya un bloque de tiempo |
