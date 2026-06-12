# Lógralo — Flujogramas de uso

> Generado el 2026-06-12 a partir del código real (rutas en `src/App.tsx`, pantallas en `src/screens/`). Los diagramas son Mermaid: GitHub y VS Code los renderizan.

## Mapa de navegación global

```mermaid
flowchart TD
    AUTH[Auth\nentrar / crear cuenta] -->|sesión iniciada,\nsin onboarding| ONB[Onboarding\n4 pasos]
    AUTH -->|sesión iniciada,\nya onboarded| TODAY
    ONB -->|Crear mi primera meta| WIZ[Wizard\n/meta/nueva]
    ONB -.->|Prefiero mirar primero| TODAY

    subgraph SHELL[Navegación principal - pestañas]
        TODAY[Hoy /]
        HAB[Hábitos /habitos]
        GOALS[Metas /metas]
        CAL[Agenda /calendario]
        PROG[Crecer /progreso]
        PERF[Perfil /perfil]
    end

    TODAY -->|tarjeta de sesión| RUN[Sesión /sesion/:id\npantalla completa]
    TODAY -->|aviso revisión| REV[Revisión /revision]
    TODAY -->|evento de agenda| CAL
    GOALS -->|tocar meta| DET[Detalle /metas/:id]
    GOALS -->|Nueva| WIZ
    GOALS -->|Ver ideas| IDEAS[Ideas /ideas]
    IDEAS -->|adoptar idea| WIZ
    WIZ -->|Crear meta| CREATED[Meta creada\n/meta/creada/:id]
    CREATED -->|Ver mi plan de hoy| TODAY
    PROG <-->|toggle| LEARN[Aprender /aprender]
    LEARN -->|CTA crear hábito| HAB
    LEARN -->|CTA crear meta| WIZ
    DET -->|Siguiente meta| IDEAS
    REV -->|Ver cómo vas| PROG
    RUN -->|cerrar sesión de trabajo| TODAY
```

---

## F1 · Alta y primera meta (el embudo completo)

```mermaid
flowchart TD
    A[Llega a la app] --> B{¿Tiene cuenta?}
    B -->|No| C[Crear cuenta\nemail + contraseña ≥6]
    C --> C2{¿Requiere confirmar email?}
    C2 -->|Sí| C3[Aviso: revisa tu casilla] --> B
    C2 -->|No| D
    B -->|Sí| D[Entrar]
    B -->|Olvidó contraseña| RP[Email de recuperación]

    D --> E{¿Completó onboarding?}
    E -->|Sí| T[Hoy]
    E -->|No| F[Paso 1: La promesa\n3 tarjetas de valor]
    F -->|Empezar| G[Paso 2: ¿Qué quieres cambiar?\n8 áreas]
    F -.->|Prefiero mirar primero| T
    G -->|No estoy seguro| H[Mini-entrevista\n3 preguntas → área sugerida]
    H --> G
    G --> I[Paso 3: ¿Cuánto tiempo al día?\n15/30/60 min o personalizado]
    I --> J[Paso 4: ¿Cuándo te es más fácil?\nmañana / mediodía / noche / depende]
    J -->|Crear mi primera meta\nguarda perfil| W0

    subgraph WIZARD[Wizard de meta - 6 pasos]
        W0[1. Título\ndetecta tipo y área] --> W1[2. Tipo de meta\nplantillas del área\n→ siembra etapas]
        W1 --> W2[3. Compromiso semanal\ndías + minutos o cantidad + hora\navisa sobrecarga, no bloquea]
        W2 --> W3[4. Etapas\neditar / reordenar / fechar]
        W3 --> W4[5. Tu ancla - opcional\nporqué / fecha / criterio de éxito]
        W4 --> W5[6. Revisar y crear]
    end

    W5 -->|crea meta + etapas + compromiso\n+ sesiones de hoy| K[Meta creada\ncamino + compromiso + primera sesión]
    K -->|Ver mi plan de hoy| T
```

Notas del código:
- El borrador del wizard se guarda en `sessionStorage` en cada cambio y se limpia al crear (`Wizard.tsx:154-186`, `:243`).
- Adoptar una idea desde `/ideas` siembra el borrador y entra directo al paso de compromiso (`wizardDraft.ts:13-39`).
- "Prefiero mirar primero" deja el onboarding incompleto: intentar `/meta/nueva` redirige a `/onboarding` (`App.tsx:140-142`).

---

## F2 · El día a día (Hoy)

```mermaid
flowchart TD
    A[Abrir la app] --> B[Hoy carga el día:\ncierra sesiones viejas,\ngenera sesiones del compromiso]
    B --> C{¿Hay aviso?\nprioridad única}
    C -->|Sesión sin confirmar ≤7 días| C1[Quedó una sesión abierta\n→ resolverla]
    C -->|Metas por revisar| C2[Revisión guiada → /revision]
    C -->|Meta olvidada ≥5 días| C3[¿La retomamos o pausamos?\nSesión hoy / Pausar / Está bien así]
    C -->|Ninguno| D

    B --> D{¿Sesiones comprometidas hoy?}
    D -->|Sí| E[Tarjetas de sesión\n⭐ prioritaria primero]
    E -->|▶ abrir| RUN[Cronómetro]
    E -->|✓ rápido| QD[Hecha sin cronómetro]
    D -->|No, pero hay metas| F[Día libre\n→ ofrecer sesión espontánea]
    D -->|No hay metas| G[Invitación: Ver ideas /\nEscribir mi propia meta]

    B --> H{¿Hábitos que tocan hoy?}
    H -->|Sí| I[Lista de hábitos\nun toque = cumplido]
    B --> J{¿Tareas propias de ayer\nsin hacer?}
    J -->|Sí| K[Aviso: Traer a hoy / Descartar]
    B --> L[Tareas propias de hoy\n+ agregar nueva]
    B --> M[Agenda de hoy\neventos → /calendario]
    B --> N[Tira semanal Lu-Do\ndía pasado → corregir:\n'Sí la hice']
```

---

## F3 · Una sesión de trabajo (máquina de estados)

```mermaid
stateDiagram-v2
    [*] --> pending: nace del compromiso\n(o espontánea)
    pending --> running: Comenzar\n(o ?start=1 desde Hoy)
    running --> paused: Pausar (solo tiempo)
    paused --> running: Reanudar\n(acumula tiempo pausado)
    running --> resolviendo: Terminé (antes del objetivo)
    running --> objetivo: reloj llega a 0\n(vibración + celebración)
    objetivo --> running: Seguir un rato más\n(cuenta hacia arriba)
    objetivo --> resolviendo: Terminé
    running --> unconfirmed: quedó abierta\nde otro día
    unconfirmed --> resolviendo: al abrirla:\n¿cómo te fue?

    resolviendo --> done: La completé
    resolviendo --> partial: Hice una parte\n(elige cuánto)
    resolviendo --> missed: Hoy no pude\n(vuelve directo, sin culpa)

    done --> cierre
    partial --> cierre
    state cierre {
        [*] --> nota: ¿Qué lograste? (opcional, 200c)
        nota --> etapa: ¿Completaste la etapa en curso?\nSí, cumplida / Aún no
        etapa --> [*]
    }
    cierre --> [*]: volver a Hoy
    missed --> [*]: volver a Hoy

    done --> pending: Deshacer (desde Hoy)
    partial --> running: Retomar (desde Hoy)
    missed --> running: Retomar (desde Hoy)
```

Notas del código:
- El reloj se calcula por timestamps (`startedAt`, `pausedTotalSeconds`), no por timers: cerrar la app no lo rompe (`domain/sessions.ts:12-32`).
- "Hoy no pude" cierra sin pedir nota ni etapa — fricción cero a propósito (`SessionRun.tsx`, ResolutionOptions).
- La racha cuenta días comprometidos con sesión done/partial; los días libres no la rompen (`currentStreakCommitted`).

---

## F4 · Crear una meta más (usuario existente)

```mermaid
flowchart TD
    A[Metas] -->|Nueva| W[Wizard paso 1\ncon defaults del perfil]
    A -->|sin metas en marcha| B[Ver ideas para empezar]
    B --> I[Ideas /ideas\n2-3 metas por área]
    I -->|tocar una idea| S[Borrador sembrado:\ntítulo + tipo + etapas]
    S --> W2[Wizard directo al paso 3:\nCompromiso]
    I -->|Escribir mi propia meta| W
    W --> R[Revisar y crear]
    W2 --> R
    R --> C[Meta creada] --> T[Hoy]
    D[Detalle de meta lograda] -->|Ver ideas para tu próxima meta| I
```

---

## F5 · Revisión semanal guiada

```mermaid
flowchart TD
    A[Aviso en Hoy:\nRevisión guiada — N metas] --> B[/revision/]
    B --> C{¿Metas vencidas\nde revisión?}
    C -->|No| D[Nada para revisar\n→ Volver a hoy]
    C -->|Sí| E[Meta i de N\ntítulo + porqué + camino visual]
    E --> F{¿Qué decides?}
    F -->|Sigo con esto| G[marca revisada]
    F -->|Cumplí la etapa X| H[etapa hecha + revisada]
    F -->|Logré la meta\nsi es la última etapa| I[meta lograda 🎉]
    F -->|Pausar esta meta| J[pausada, sin culpa]
    G --> K{¿Quedan metas?}
    H --> K
    I --> K
    J --> K
    K -->|Sí| E
    K -->|No| L[Resumen: repasaste N metas\nchips: avanzadas / logradas / en marcha / en pausa]
    L -->|Ver cómo vas| M[Progreso]
    L -->|Volver a hoy| N[Hoy]
```

---

## F6 · Hábitos

```mermaid
flowchart TD
    A[Pestaña Hábitos] --> B{¿Tiene hábitos?}
    B -->|No| C[Ideas populares de un toque\no crear el primero]
    B -->|Sí| D[Lista: cada hábito con\nsu semana Lu-Do y racha 🔥]
    C --> E[Formulario:\nnombre + área + días\nsin días = todos los días]
    E -->|Crear| F[Hábito creado ✓ toast]
    D -->|menú ⋯| G[Editar días / Archivar]

    H[Aprender: lección con CTA] -->|Crear el hábito: X| E2[Formulario precargado\npor deep-link ?nuevo=]
    E2 --> F

    F --> I[Hoy: aparece en\n'Tus hábitos de hoy'\nlos días que toca]
    I -->|un toque| J[Cumplido hoy\nracha +1]
    J -->|otro toque| K[Desmarcado]
```

---

## F7 · Agenda (calendario propio)

```mermaid
flowchart TD
    A[Pestaña Agenda] --> B{Vista}
    B --> C[Día - default móvil]
    B --> D[Semana]
    B --> E[Mes - default escritorio\ndots: sesiones / eventos / deadlines]
    E -->|tocar un día| C

    C --> F{Elemento del día}
    F -->|Sesión real de hoy\npendiente o en curso| G[Abrir cronómetro /sesion/:id]
    F -->|Sesión comprometida\nsin hora fijada| H[¿A qué hora te queda cómodo?\nguarda para todos los X]
    F -->|Evento| I[Editor de evento]
    F -->|+ nuevo| I

    I --> J[Título + fecha\nDía completo u horario inicio-fin\nmeta vinculada opcional + notas]
    J -->|Crear / Guardar| K[Evento en la agenda\nsi tiene meta: suma minutos a la meta]
    J -->|Borrar| L[Confirmación inline]

    M[Hoy: Tu agenda de hoy] -->|tocar evento| C
```
