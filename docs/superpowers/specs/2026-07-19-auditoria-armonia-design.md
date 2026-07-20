# Lógralo — Auditoría de armonía y flujo de punta a punta

> Diseño validado con el usuario el 2026-07-19.
> Objetivo: entender la app entera como la vive un usuario y juzgar si el conjunto es
> **una sola app** — coherente, sin fricción y funcional de principio a fin.
> Entregable: un documento de hallazgos priorizados. **En este ciclo no se toca código.**

## 1. Problema

La app tiene 17 pantallas y dos auditorías previas (`AUDITORIA.md` de mayo,
`AUDITORIA-2026-06.md` de junio), más un análisis de navegación página por página
(`docs/analisis/navegacion-claridad.md`) que cerró casi todo con "sin cambios".

Nada de eso responde la pregunta que importa ahora: **¿el conjunto se siente una sola app?**
Las auditorías previas evaluaron pantallas de a una, en aislamiento. La armonía —vocabulario
consistente, mismos gestos para las mismas acciones, un hilo narrativo continuo— solo es
visible con el panorama completo en la mano.

Hay además un problema de método probado: en junio, **2 de 15 hallazgos resultaron falsos**
(`mejoras-frescas.md` #2 y #6) porque se dedujeron leyendo código sin ejecutar la app. Al
verificar uno de ellos apareció un bug real que la lectura no había visto (ruta `/meta/:id`
inexistente). El código miente sobre lo que el usuario experimenta; hay que mirar la app.

## 2. Decisiones (cerradas con el usuario)

| Decisión | Elección |
|---|---|
| Modo de trabajo | **Auditoría completa primero, arreglos después.** Un documento único priorizado; los arreglos salen de un plan posterior |
| Método | **App corriendo + código.** Recorrido en vivo con Chrome vía Playwright, capturas como evidencia |
| Dimensiones | **Armonía del conjunto** + **flujo de punta a punta** + **funcionalidades** (agregado por el usuario). Quedan fuera: estados extremos y fluidez percibida |
| Cuenta | **Cuenta nueva de prueba** en el Supabase del proyecto, para vivir el embudo de entrada completo |
| Arquitectura | **Híbrido (enfoque C):** evidencia en vivo la levanto yo → mapeo estructural en paralelo por agentes → un único analista con TODO el panorama juzga la armonía → verificación adversarial |
| Datos de prueba | Sembrados **a través de la app y su API pública con la sesión del usuario de prueba**. Nunca claves de servicio ni acceso directo a la base |
| Alcance de cambios | **Ninguno.** El resultado es el documento |

### Por qué el enfoque híbrido y no las alternativas

- **Solo yo, secuencial:** juicio muy coherente, pero 18 pantallas en un contexto significa que
  las primeras se desdibujan al llegar a las últimas.
- **Fan-out multi-agente puro:** máxima cobertura, pero sin recorrido en vivo — repite
  exactamente el método que produjo los falsos positivos de junio.
- **Híbrido:** único que combina evidencia real (mata falsos positivos) con panorama completo
  (posibilita el juicio de armonía). El usuario autorizó explícitamente la orquestación
  multi-agente que esto implica.

## 3. El recorrido

Las pantallas se caminan **en el orden en que un usuario real las encuentra**, no por carpeta:
la armonía se rompe en las costuras entre pantallas, no dentro de ellas.

| Tramo | Pantallas | Qué se busca |
|---|---|---|
| **1 · Entrada** | Auth → Onboarding (4 pasos + mini-entrevista "no estoy seguro") → Wizard (título → plantilla → compromiso → etapas → ancla → revisar) → GoalCreated | El embudo completo: cuántos pasos hasta la primera meta, qué se pregunta dos veces |
| **2 · Día vivo** | Today (día 1) → SessionRun (cronómetro completo + cierres "hice una parte" y "hoy no pude") → Today resuelto | El ciclo que el usuario repite todos los días |
| **3 · Construir el sistema** | Habits (crear, vincular a meta) → Goals (lista + peek) → GoalDetail (progreso, compromiso, camino, avances, hábitos vinculados) | Cómo crece la app con el usuario |
| **4 · Perspectiva** | Calendar (día/semana/mes) → Progress ↔ Learn (toggle "Crecer") → Review → Profile | Las pantallas de mirar hacia atrás y hacia adelante |
| **5 · Bordes** | GoalSuggestions, UpdatePassword, ConfigNeeded | Lo que se visita poco y envejece mal |

Cada pantalla se captura en **móvil (360px)** y **escritorio (≥1024px)**: tienen navegaciones
distintas (barra inferior vs barra lateral) y ahí es donde la armonía suele quebrarse.

## 4. Los ejes de juicio

Para que el veredicto sea evaluable y no opinión suelta, el analista final mide ejes concretos.

### 4.1 Armonía del conjunto

1. **Vocabulario** — ¿la misma cosa se llama igual en todas partes? (sesión / bloque /
   compromiso / momento; meta / hito / etapa; la pestaña "Crecer" que aterriza en "Progreso").
2. **Gramática de acciones** — la misma acción, ¿mismo gesto en todas partes? "Marcar hecho"
   hoy existe como ✓ rápido en Today, cierre de cronómetro en SessionRun, fila en Habits y
   botón en GoalDetail.
3. **Anatomía de pantalla** — kicker + título + secciones: ¿todas obedecen el mismo esqueleto?
4. **Tono del copy** — operativo, sin culpa, tuteo, sin motivación vacía. ¿Qué pantallas se salen?
5. **Orientación y retorno** — en cada pantalla: dónde estoy, de dónde vine, a dónde vuelvo.
6. **Densidad y ritmo** — pantallas que pesan de más junto a pantallas casi vacías.
7. **Hilo narrativo** — meta → etapa → sesión → avance. ¿Se ve desde cualquier pantalla, o hay
   zonas huérfanas donde el usuario pierde el porqué?

### 4.2 Flujo de punta a punta

Cuatro preguntas **por costura** entre pantallas:

- ¿Hay pasos de más o campos que nadie necesita?
- ¿Hay callejón sin salida — una pantalla sin siguiente paso evidente?
- ¿Hay un "¿y ahora qué?" sin responder?
- ¿Se le vuelve a preguntar algo que el usuario ya decidió?

### 4.3 Funcionalidades

Dos preguntas distintas, ambas exigidas por el usuario:

- **¿Funciona?** Cada botón, cada acción, cada estado se prueba en vivo. Lo que la pantalla
  promete, ¿lo cumple? Ninguna auditoría previa pudo verificar esto.
- **¿Debe existir?** Con el panorama completo: qué funcionalidad sobra, cuál falta, y cuál
  existe pero está escondida donde nadie la encuentra.

## 5. Fases de ejecución

### Fase 0 · Preparación

Levantar el dev server de Vite y manejar Chrome instalado (`channel: 'chrome'` en Playwright —
no requiere descargar navegadores). Crear la cuenta de prueba **desde la propia pantalla de
registro**, para que el registro también quede auditado.

Para las pantallas que necesitan historial (Progress, Calendar, Review) se siembran datos con
`supabase-js` autenticado como el usuario de prueba, respetando RLS. Restricción firme: **sin
claves de servicio, sin contraseña de base de datos, sin escritura directa a tablas fuera de RLS.**

**Salida:** app accesible, cuenta de prueba operativa, script de captura funcionando.

### Fase 1 · Expediente visual (secuencial, lo hago yo)

Recorrer los 5 tramos. Por cada pantalla: capturas móvil + escritorio, y una **prueba activa de
cada acción disponible** (no solo mirar: tocar). Registrar lo que pasa, incluyendo lo que no
pasa cuando debería.

**Salida:** `docs/analisis/expediente/` con capturas numeradas por tramo y un `notas.md` con
observación literal por pantalla — hechos, no juicios.

### Fase 2 · Mapeo estructural (paralelo, 5 agentes)

Cada agente recibe el expediente visual y levanta el mapa de su zona contrastando código contra
lo observado:

| Agente | Zona |
|---|---|
| A | Entrada: Auth, Onboarding, Wizard + `components/wizard/*`, GoalCreated |
| B | Día vivo: Today, SessionRun |
| C | Metas y hábitos: Goals, GoalDetail, Habits, GoalSuggestions |
| D | Perspectiva: Calendar, Progress, Learn, Review, Profile |
| E | Transversal: `styles/tokens.css`, `components.css`, componentes compartidos, vocabulario del copy, `content/` |

**Salida por agente:** inventario de patrones de UI usados, vocabulario empleado, estructura de
pantalla, entradas y salidas de navegación, y toda divergencia respecto de lo observado en vivo.

### Fase 3 · El analista de armonía (uno solo, con todo)

Un único agente recibe el expediente completo más los cinco mapas y emite el juicio sobre los
ejes de §4. Es el "agente que entiende todo": nadie más ve el panorama entero, y por eso nadie
más está en posición de juzgar el conjunto.

**Salida:** hallazgos en bruto, cada uno con eje, pantallas implicadas, evidencia y arreglo propuesto.

### Fase 4 · Verificación adversarial (paralelo, por hallazgo)

Cada hallazgo pasa por un verificador cuya tarea explícita es **refutarlo** contra la evidencia
capturada y el código. En la duda, se descarta. Es el paso que habría matado los dos hallazgos
falsos de junio antes de llegar al usuario.

**Salida:** hallazgos confirmados, con los refutados listados aparte y su razón — igual que
`mejoras-frescas.md` documentó sus dos descartes.

### Fase 5 · Informe

**Salida:** `docs/analisis/2026-07-19-auditoria-armonia.md`, con:

1. **El panorama** — la app tal como se vive, no como está organizada en carpetas.
2. **Veredicto por eje** — los siete ejes de armonía, el flujo, y funcionalidades; cada uno con
   veredicto y evidencia.
3. **Hallazgos priorizados** — pantalla, `archivo:línea`, la captura que lo prueba, qué rompe
   exactamente, arreglo propuesto, esfuerzo × impacto.
4. **Tabla de decisión** — tres niveles: **rompe la experiencia** / **vale la pena** /
   **cosmético**, para elegir rápido qué se arregla.
5. **Anexo de capturas** y **anexo de hallazgos refutados**.

## 6. Criterios de aceptación

La auditoría está terminada cuando:

- Las 17 pantallas de `src/screens/` fueron visitadas en vivo y capturadas en móvil y escritorio.
- Cada acción interactiva de cada pantalla fue ejecutada al menos una vez.
- Los siete ejes de armonía tienen veredicto con evidencia concreta, no genérica.
- Cada costura entre pantallas del recorrido §3 fue evaluada con las cuatro preguntas de §4.2.
- **Todo hallazgo del informe pasó verificación adversarial.** Ninguno se apoya solo en lectura
  de código.
- Cada hallazgo tiene arreglo propuesto y clasificación esfuerzo × impacto.
- El documento permite decidir qué arreglar sin volver a abrir el código.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| La cuenta de prueba ensucia el Supabase de producción | Prefijo identificable en el email; eliminación al cerrar la auditoría (la propia app tiene "eliminar cuenta") |
| El sembrado de datos no llega a reproducir un historial creíble para Review/Progress | Se documenta qué no se pudo observar en lugar de inferirlo del código |
| El paralelismo de la Fase 2 produce mapas incoherentes entre sí | La Fase 3 es un único analista precisamente para reconciliarlos; los mapas son insumo, no conclusión |
| Hallazgos que repiten los de auditorías previas | Los agentes reciben `AUDITORIA-2026-06.md`, `mejoras-frescas.md` y `navegacion-claridad.md` como contexto de "ya conocido" |

## 8. Fuera de alcance

- **Cualquier cambio de código.** El resultado es el documento.
- Estados extremos (vacío / error / muchos datos) y fluidez percibida — descartados
  explícitamente por el usuario en el brainstorming. La fluidez ya tiene su propia línea de
  trabajo (`2026-07-15-cache-sesion-fluidez-design.md`).
- Rendimiento, seguridad, accesibilidad formal (WCAG) y arquitectura de datos.
- Rediseño visual. La auditoría señala incoherencias; no propone una identidad nueva.
