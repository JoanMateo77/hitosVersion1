# Lógralo — Auditoría de armonía y flujo de punta a punta

> 21 de julio de 2026. Auditoría **en vivo**: la app se levantó, se creó una cuenta nueva desde la
> pantalla de registro y se recorrieron las 17 pantallas tocando cada control, en móvil (360px) y
> escritorio (1440px). Diseño de la auditoría: `docs/superpowers/specs/2026-07-19-auditoria-armonia-design.md`.
>
> **Regla del método:** ningún hallazgo entra aquí sin haber sido observado en vivo y sin haber
> sobrevivido a un verificador cuya tarea era refutarlo. **45 hallazgos confirmados; 19 sospechas
> descartadas** por no resistir la verificación (§6).

## 1. El panorama

La app se vive en cuatro tiempos, no en cinco pestañas:

1. **Entrar y comprometerse** — registro → onboarding (4 pasos) → asistente (6 pasos) → "Meta creada".
   El usuario dice qué quiere, cuántos días y cuánto tiempo. Sale con un compromiso concreto.
2. **El día vivo** — Hoy y la sesión con cronómetro. Es el ciclo que se repite y donde la app se gana
   o se pierde al usuario.
3. **Construir el sistema** — metas, etapas y hábitos: la estructura que sostiene el compromiso.
4. **Mirar hacia atrás** — agenda, progreso, aprender y la revisión guiada.

**La estructura es buena.** Los cuatro tiempos existen, se encadenan y cada pantalla sabe cuál es su
papel. El problema no es el mapa: son las **costuras** entre pantallas y un puñado de funciones que
prometen algo y hacen otra cosa.

## 2. Veredicto por eje

| Eje | Veredicto |
|---|---|
| **Anatomía de pantalla** | **Sana.** 14 de 17 pantallas usan el mismo esqueleto (`.screen__title`, kicker + título + secciones). Las tres excepciones —Auth, SessionRun, ConfigNeeded— son inmersivas a propósito. |
| **Sistema visual** | **Sano.** Cero colores escritos a mano en las 17 pantallas: todo sale de tokens. Los estilos sueltos que hay son utilidades de maquetado, no valores de diseño inventados. |
| **Vocabulario** | **Casi sano, con roces.** El término interno "hito" nunca se filtra a la interfaz (la UI dice "etapa", de forma consistente). Los roces están en los bordes: la misma tarjeta llama "momento" y "sesión" a lo mismo; la lista de metas dice "Progreso" donde la navegación dice "Crecer"; Hábitos se titula "Rutinas de un toque" en una pantalla donde no se puede tocar ningún hábito. |
| **Gramática de acciones** | **La principal fuente de desarmonía.** La misma acción se hace de formas distintas según dónde estés, y algunas solo existen en un sitio: anotar un avance tiene dos gramáticas incompatibles; un hábito se marca desde Hoy pero **no** desde Hábitos; una etapa se puede renombrar y un hábito no. |
| **Orientación y retorno** | **Con agujeros reales.** Revisión y Aprender dejan la navegación **sin ninguna pestaña marcada**: el usuario no sabe dónde está. Los tres niveles de Aprender comparten una sola URL, así que el "atrás" del sistema te expulsa de la sección. El "Volver" de Ideas siempre aterriza en Hoy, vengas de donde vengas. |
| **Hilo narrativo** | **Se corta en el detalle de meta.** Es la pantalla que cuenta la historia completa (progreso, compromiso, camino, avances) y es la única desde la que **no se puede trabajar la meta**: ni empezar una sesión, ni registrar un avance. Se mira, no se usa. |
| **Densidad y ritmo** | **Correcto.** Ninguna pantalla resultó abrumadora ni vacía de más en el recorrido. |
| **Funcionalidad** | **Seis fallos que rompen la experiencia** (§3), incluido uno que deja la Revisión guiada inservible. |
| **Flujo de punta a punta** | **Se rompe justo en la entrada.** El onboarding promete llevarte a crear tu primera meta y te deja en una pantalla vacía. |

## 3. Lo que rompe la experiencia

Ocho hallazgos. Si solo se arregla una cosa de este informe, que sea esta sección.

### 3.1 El onboarding nunca llega al asistente
**Reproducido 3 de 3 veces.** "Crear mi primera meta" navega a `/meta/nueva` y el usuario es expulsado
a Hoy. Traza: `/meta/nueva → / → /`. En `Onboarding.tsx:62-77`, `finish()` actualiza el perfil y navega
en el mismo instante; la ruta se evalúa con el perfil viejo y `RequireOnboarded` rebota. Verificado que
`/meta/nueva` funciona perfectamente si se entra con el onboarding ya completo.
**Impacto:** todo usuario nuevo. Rompe la promesa central del onboarding.
**Arreglo:** navegar solo después de que el perfil actualizado esté propagado (efecto dependiente de
`profile.onboardedAt`), no en el mismo tick que `setProfile`.

### 3.2 La Revisión guiada está rota de raíz
"Sigo con esto" —su acción principal— **falla siempre** y muestra en pantalla el error crudo de la base
de datos, en inglés: «Could not find the 'last_reviewed_at' column of 'goals' in the schema cache»
(HTTP 400). La revisión nunca avanza a la meta siguiente.
Peor: "Cumplí la etapa" **sí** avanza la etapa y **luego** muestra el error, dejando el cambio a medias;
pulsarlo otra vez salta etapas (1 → 2 → 3 → 4) sin avisar.
**Arreglo:** aplicar la migración pendiente en Supabase, y que el `catch` no vuelque nunca el mensaje del
servidor: copy propio en español. Ordenar la acción para que un fallo no deje el cambio a mitad.

### 3.3 Decir "hoy no pude" te felicita
Al cerrar una sesión con "Hoy no pude", Hoy responde **"Cumpliste tu compromiso de hoy"** y el contador
marca **1 de 1**, mientras la fila dice "Hoy no pudiste — está bien" y el resumen semanal dice "0 de 10".
Cinco lecturas contradictorias en una sola pantalla.
**Arreglo:** que titular y contador distingan *cumplida* de *resuelta*. Con una sesión no cumplida:
titular neutro, contador "0 de 1", y tratamiento visual distinto del verde.

### 3.4 "Deshacer" deja viva la nota y crea avances fantasma
Tras el ✓ rápido aparece "¿Qué lograste?"; al pulsar "Deshacer", la sesión vuelve a pendiente **pero el
panel de la nota sigue en pantalla**. Lo que escribas ahí se guarda como avance de una sesión que la app
cuenta como no hecha.
**Arreglo:** cerrar el panel al deshacer y no aceptar avances sobre sesiones sin cerrar.

### 3.5 La sesión añadida desde la Agenda nace muerta
"+ Sesión para una meta" la crea y muestra un toast de éxito, pero la tarjeta queda con "—" en la hora y
**no se puede abrir, ni ponerle hora, ni quitarla**. Es un elemento inerte que aparenta ser un botón.
**Arreglo:** que al tocarla se abra una hoja con hora y "Quitar esta sesión". Como mínimo, no renderizarla
como botón si no hace nada.

### 3.6 El número de la semana en Progreso no cuadra nunca
El anillo dice "0/10 sesiones" mientras la lista de debajo suma 9: la décima viene de una meta **pausada**
que no aparece en la lista. El objetivo es inalcanzable por construcción.
**Arreglo:** calcular la semana solo con metas activas — las mismas que se listan debajo.

### 3.7 Callejón sin salida en el registro
Sin el correo de confirmación no hay escapatoria: **no existe reenvío en toda la app**, entrar responde
"confirma tu email" y registrarse otra vez responde "ya existe una cuenta". La única salida es
"¿Olvidaste tu contraseña?", que nadie sugiere. *(Vivido en carne propia durante esta auditoría.)*
**Arreglo:** botón "Reenviar correo de confirmación" en el aviso posterior al registro y en el error de login.

### 3.8 Los errores del registro mienten sobre su causa
Supabase responde `email_address_invalid` (HTTP 400) y la app dice "Algo salió mal. Inténtalo de nuevo en
un momento": culpa a un fallo pasajero y empuja a reintentar algo que nunca funcionará.
**Arreglo:** traducir ese código a "Ese email no es válido. Revísalo."

## 4. Vale la pena arreglarlo

| # | Hallazgo | Pantalla |
|---|---|---|
| 1 | "Rutinas de un toque" no tiene ningún toque: **no se puede marcar un hábito desde Hábitos** (sí desde Hoy) | `/habitos` |
| 2 | Un hábito creado hace un minuto ya arrastra un día incumplido | `/habitos`, `/` |
| 3 | Anotar el avance tiene **dos gramáticas distintas** según desde dónde lo hagas | `/`, `/sesion/:id` |
| 4 | "Retomar" **borra el parcial ya guardado** y el día vuelve a cero, sin avisar | `/` → `/sesion/:id` |
| 5 | Un hábito no se puede renombrar; una etapa sí | `/habitos` vs `/metas/:id` |
| 6 | El "Volver" de Ideas siempre aterriza en Hoy, nunca de donde viniste | `/ideas` |
| 7 | Quitar una etapa borra al instante, sin confirmación ni deshacer, tras una ✕ sin etiqueta visible | `/metas/:id` |
| 8 | **El detalle de meta no deja trabajar la meta**: ni empezar sesión ni registrar avance | `/metas/:id` |
| 9 | Al adoptar una idea caes en el paso 3 del asistente sin que la pantalla nombre nunca la meta adoptada | `/ideas` → asistente |
| 10 | En "Últimas 8 semanas" la barra dice 100% y el pie del mismo gráfico dice 8% | `/progreso` |
| 11 | Dentro de Aprender **ninguna pestaña queda marcada**: la app no dice dónde estás | `/aprender` |
| 12 | Los tres niveles de Aprender comparten una URL: el "atrás" del sistema te saca de la sección | `/aprender` |
| 13 | Una lección no lleva a la siguiente: hay que salir y entrar seis veces | `/aprender` |
| 14 | La vista Semana se titula con el mes del lunes aunque la semana termine en otro mes | `/calendario` |
| 15 | "Tu camino" muestra hitos de metas pausadas sin decir que lo están | `/progreso` |
| 16 | En móvil, los textos de etapas consecutivas del camino **se solapan y se leen encimados** | `/revision` (Roadmap) |
| 17 | La revisión pide decidir sobre metas creadas hace minutos, con un contexto que las hace parecer abandonadas | `/revision` |
| 18 | El resumen celebra con confeti aunque no hayas revisado nada | `/revision` |
| 19 | Revisión y Aprender dejan la navegación sin pestaña marcada y sin control de salida | `/revision`, `/aprender` |

## 5. Cosmético

Concordancias ("1 sesiones totales"), "lograla" sin tilde, dos botones "Editar" con alcances distintos en
la misma pantalla, el peek que no cierra con Escape mientras la hoja de Agenda sí, el selector de tema
duplicado en el Perfil de escritorio, el mínimo de 5 minutos en el cierre parcial cuando el cronómetro
dice 4, la tira semanal que anuncia "sin cumplir" un día que al abrirlo dice "no hubo sesiones" (solo
audible para lectores de pantalla; el punto es beige neutro y visualmente no acusa), y ocho más
detallados en el anexo.

## 6. Lo que se descartó (y por qué importa)

**19 sospechas no sobrevivieron a la verificación.** Se listan porque evitan volver a levantarlas:

- Login vacío y contraseña corta "sin aviso" → el formulario tiene `required` y `minLength=6`; el
  navegador frena antes de enviar.
- "No se comunica el mínimo de contraseña" → el placeholder dice "Mínimo 6 caracteres" (no aparecía en
  el texto de la página porque los placeholders no son texto).
- "Recuperar contraseña con campo vacío promete un email" → dice "Escribe tu email arriba" y no llama al
  servidor. La prueba original estaba contaminada por un valor de un paso anterior.
- "Logo y tagline duplicados en escritorio" → el CSS oculta uno; la captura lo desmiente.
- "No se puede volver en el onboarding ni en el asistente" → **sí se puede**: el botón existe como
  ícono con `aria-label="Volver"`, en ambos flujos, con el mismo componente. Armonía correcta.
- "Las pantallas se salen del sistema de diseño" → cero colores fuera de tokens.
- "El vocabulario interno se filtra a la interfaz" → "hito" solo vive en el código.

**Por qué importa:** la ronda de junio publicó dos hallazgos falsos por deducirlos del código sin
ejecutar la app. Aquí, **una de cada tres sospechas resultó falsa** — y las que quedaron están todas
reproducidas en vivo.

## 7. Conclusión

**La app está mejor construida de lo que sugerían las auditorías anteriores.** El sistema visual, la
anatomía de las pantallas, el vocabulario de dominio, el asistente completo de 6 pasos y "Meta creada"
son sólidos y coherentes: se siente una sola app.

Lo que falla está concentrado y es reparable:

1. **Dos puertas rotas en los extremos del recorrido** — el onboarding no entrega al asistente (3.1) y la
   revisión no funciona (3.2). Son las que más daño hacen y las más baratas de arreglar.
2. **La app no distingue "no pude" de "cumplí"** (3.3) — y esa confusión contamina contadores, colores y
   titulares. Es el hallazgo más profundo: toca el modelo de datos del día, no solo el copy.
3. **La misma acción se hace distinto según dónde estés** (§4, #1/#3/#5) — la mayor fuente de desarmonía
   real, y la que un usuario nota sin saber nombrarla.
4. **El detalle de meta se mira pero no se usa** (§4, #8) — la pantalla que mejor cuenta la historia es la
   única desde la que no se puede actuar.

Orden sugerido: 3.2 y 3.1 (una tarde), luego 3.3, luego los cuatro de gramática de acciones.

---

## Anexo · Los 41 hallazgos del recorrido en vivo

Cada uno fue reproducido por un verificador independiente cuyo encargo era refutarlo. El detalle completo
—evidencia literal observada en vivo y arreglo propuesto para cada uno— está en
`docs/analisis/expediente/2026-07-21-hallazgos.json`.

Las 702 capturas del recorrido (134 MB, móvil y escritorio) quedaron fuera del repositorio por tamaño;
viven en el directorio temporal de la sesión de auditoría.
