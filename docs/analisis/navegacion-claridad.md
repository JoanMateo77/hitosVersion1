# Lógralo — Análisis de claridad de navegación, página por página

> 2026-06-12. La pregunta en cada pantalla: **¿es simple navegar? ¿es cómodo? ¿está claro qué hacer? ¿el usuario puede sentirse perdido?** — evaluado en escritorio (≥1024px: barra lateral) y móvil (<1024px: TopBar + barra inferior). Las mejoras marcadas ✅ se aplicaron en el commit `293f55b`.

## Navegación global

**Móvil — había un problema real, ya corregido ✅.** La barra inferior tenía **6 pestañas** a 11px: una más del máximo profesional (5) y zonas táctiles de ~60px en un teléfono de 360px de ancho, con riesgo de toques errados entre Crecer y Perfil. **Arreglo aplicado:** Perfil ahora vive como **avatar en el TopBar** (arriba a la derecha, patrón estándar de apps móviles — el TopBar ya tenía el espacio reservado con `space-between`), y la barra inferior queda con 5 pestañas cómodas: Hoy · Hábitos · Metas · Agenda · Crecer.

**Escritorio — bien.** La barra lateral con 6 ítems verticales no tiene problema de espacio; mantiene Perfil como ítem (dos accesos no compiten porque solo una nav se ve por viewport). La identidad (email + "Día N en Lógralo") arriba orienta.

**Señal de "dónde estoy" — bien.** El ítem activo se resalta visualmente y react-router pone `aria-current="page"` solo. Cada pantalla abre con su título grande (patrón consistente: kicker + título). El scroll vuelve arriba al cambiar de ruta (feel nativo).

**Detalle de naming aceptado:** la pestaña dice "Crecer" y aterriza en una pantalla titulada "Progreso" con el toggle Progreso|Aprender. El salto es leve y el toggle lo explica al instante; renombrarlo es decisión de marca, no de claridad. Sin cambios.

## Página por página

### Hoy (`/`)
- **¿Simple? Sí.** Una columna en móvil con jerarquía correcta: semana → sesión en curso → un solo aviso (nunca se apilan) → sesiones → hábitos → tus tareas → agenda. En escritorio, dos columnas con lo accionable a la izquierda.
- **¿Perdido? No.** Título "Tu día" + fecha + racha; el resumen "2 de 4 sesiones esta semana" (agregado en rondas previas) da contexto sin navegar.
- **Comodidad móvil:** scroll largo pero ordenado; lo crítico está arriba del fold. Sin cambios.

### Sesión (`/sesion/:id`)
- **¿Claro? Sí** — pantalla inmersiva a propósito (sin barras), cronómetro protagonista, cierre honesto con 3 opciones.
- **¿Perdido? Riesgo leve, corregido ✅:** la única salida era una **flecha sola** arriba a la izquierda; en escritorio, flotando en una pantalla casi vacía, no decía a dónde vuelve. Ahora es un botón con texto: **"← Tu día"**.
- El estado siempre se anuncia (en curso / en pausa / cuánto siguió el reloj sin ti). Sin más cambios.

### Hábitos (`/habitos`)
- **¿Simple? Sí.** Lista clara, crear con un botón visible, ideas populares de un toque, menú ⋯ por hábito.
- **¿Perdido? No.** El estado vacío invita a la acción. El tag de meta vinculada explica la relación. Sin cambios.

### Metas (`/metas`) y vista previa
- **¿Cómodo? Sí.** Tarjetas con progreso visible; la vista previa (peek) tiene salidas claras: "Abrir meta" / "Cerrar", y tocar fuera también cierra. Las cerradas/archivadas no estorban (viven en Progreso, con enlace). Sin cambios.

### Detalle de meta (`/metas/:id`)
- **¿Claro? Sí.** El botón volver regresa al origen real (Hoy/Agenda/Metas) o cae a /metas en deep-link. En edición, el título cambia a "Editar meta" y hay Cancelar explícito (y el borrador sobrevive recargas).
- **Móvil:** página larga pero seccionada con kickers ("Tu progreso", "Tu compromiso", "El camino", "Tus avances", "Hábitos que suman", "En tu agenda esta semana"). Cada card lateral cae debajo en orden lógico. Sin cambios.

### Agenda (`/calendario`)
- **¿Cómodo? Sí, y adaptado por dispositivo:** móvil abre en **Día** (lo inmediato), escritorio en **Mes** (visión completa) — decisión correcta ya existente. Flechas + botón "Hoy" + selector Día/Semana/Mes siempre visibles; el título del header cambia con la vista (orientación constante).
- **¿Perdido? No.** Las sesiones comprometidas se distinguen de eventos por color y etiqueta de estado; el hint de primera vez explica la pantalla. Los "+N" del mes (ronda previa) evitan sorpresas de densidad. Sin cambios.

### Crecer (`/progreso` y `/aprender`)
- **¿Claro? Sí.** El toggle Progreso|Aprender arriba de ambas explica las dos caras de la pestaña. En Aprender, la navegación interna (colecciones → colección → lección) usa botones atrás propios que nunca te sacan de la zona por accidente. "Para tu foco" orienta qué leer primero. Sin cambios.

### Revisión (`/revision`)
- **¿Perdido? No — es el flujo mejor orientado:** "Meta X de Y" en el header, contexto de datos para decidir, "Saltar por ahora", y un resumen final con salidas explícitas ("Ver cómo vas" / "Volver a hoy"). El estado vacío también orienta. Sin cambios.

### Perfil (`/perfil`)
- **¿Simple? Sí.** Cards apiladas con un ajuste por card; el peligro (eliminar cuenta) pide confirmación inline y está al fondo. Sin cambios.

### Onboarding y Wizard (flujos sin barras)
- **¿Perdido? Riesgo real, corregido ✅:** ambos mostraban el progreso solo con **puntos decorativos** (`aria-hidden`) — un usuario no sabía si faltaban 2 pasos o 5, y un lector de pantalla no tenía NINGUNA señal de progreso. Ahora ambos muestran **"Paso X de Y"** en texto junto a los puntos.
- Salidas seguras ya existentes: el botón atrás del Wizard en el paso 1 vuelve a Hoy y el borrador persiste (nada se pierde); "Ver ideas" es un desvío con regreso claro.

### Ideas (`/ideas`) y Meta creada
- **¿Claro? Sí.** Ideas: una decisión por pantalla (adoptar o escribir la mía). Meta creada: celebración + camino + compromiso + primera sesión, CTA única "Ver mi plan de hoy" y el enlace discreto "Ver o ajustar esta meta" (ronda previa). Sin cambios.

## Resumen

| Pantalla | Escritorio | Móvil | Acción |
|---|---|---|---|
| Navegación global | ✅ bien | ⚠️ 6 pestañas | ✅ Perfil al avatar del TopBar → 5 pestañas |
| Hoy | ✅ | ✅ | — |
| Sesión | ⚠️ flecha sola | ⚠️ ídem | ✅ botón "← Tu día" con texto |
| Hábitos / Metas / Detalle | ✅ | ✅ | — |
| Agenda | ✅ (mes) | ✅ (día) | — |
| Crecer / Revisión / Perfil | ✅ | ✅ | — |
| Onboarding / Wizard | ⚠️ puntos sin número | ⚠️ ídem | ✅ "Paso X de Y" visible y accesible |
| Ideas / Meta creada | ✅ | ✅ | — |

**Veredicto general:** la app ya tenía una base de orientación sólida (títulos consistentes, un aviso a la vez, salidas explícitas en cada flujo, vistas por defecto adaptadas al dispositivo). Los tres puntos donde alguien podía dudar — barra inferior apretada, la flecha muda de la sesión y el progreso ciego de los asistentes — quedaron corregidos con cambios seguros que no alteran ninguna ruta ni comportamiento existente.
