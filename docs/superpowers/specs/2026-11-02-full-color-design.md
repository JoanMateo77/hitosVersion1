# Full color: color y vida en toda la app

Fecha: 2026-11-02 · Rama: `feat/full-color` · Mockup: `docs/diseno/2026-11-02-color-metas/metas-color-mockup.html` (versión "Full color", intensidad 92 %).

## Problema
La app se lee gris, azul y oscura. Los 8 colores de área existen (`--niche-*`), pero se aplican al 8-22 % mezclados con gris, así que las metas no se distinguen de un vistazo y la app se siente apagada.

## Decisión
Estilo **full color**: colores planos y saturados, superficies pintadas con el color del área, relieve en lo que se toca y movimiento solo en los momentos que importan.

### Reglas de color (la gramática)
1. **Azul = actuar.** Botón principal, coach (✦) y enlaces. Nada más es azul. Como fondo de botón es `--action`; como texto o anillo de foco, `--action-text` / `--focus-ring`, que cambian por tema para leerse ≥ 4.5:1.
2. **Color del área = de qué meta se habla.** Ícono, tarjeta de meta, barra de progreso, etapa actual y cabecera del detalle.
3. **Verde = cumplido / al día. Naranja = atrasado.** Solo estados, con colores propios (`--state-base-ok` #22b573, `--state-base-late` #f57c0a) que ningún área usa.
4. **Intensidad 92 %.** Cada color de área se mezcla 8 % con un gris neutro (`color-mix(in oklch, …)`): baja la saturación sin oscurecer. El 92 % es un token (`--intensity`) y se ajusta en un único lugar.
5. **Tinta por área.** En superficies de color el texto es blanco o tinta oscura según cuál se lee mejor en ese tono (salud lima, finanzas amarillo y bienestar celeste llevan tinta oscura; carrera petróleo, aprendizaje violeta, relaciones frambuesa, creatividad magenta y otra pizarra llevan blanco). Los tonos de área están separados al menos 25° (OKLCH) del azul de acción y de los dos estados, para que una tarjeta nunca se confunda con un botón ni un chip de estado desaparezca sobre su tarjeta. Una prueba automática (`npm run check:contrast`, en CI y pre-commit) exige esa distancia y contraste ≥ 4.5:1 en texto normal y ≥ 3:1 en texto grande e íconos, en claro y oscuro.

### Relieve
Lo que se toca (botón principal, tarjeta de meta, "Marcar etapa cumplida", días de la semana) lleva un borde inferior de 4 px en un tono más oscuro y se hunde al tocarlo (`--lip`). Lo que no se toca no lleva relieve. El tono del relieve sale de un token (`--vivid-lip`, `--action-lip`, `--neutral-lip`), nunca se calcula a mano.

### Movimiento (solo como respuesta o logro)
- La barra de progreso se llena al entrar a la pantalla, una vez.
- Etapa cumplida: el segmento se llena y suelta un destello del color del área.
- La racha sube: la llama late y el número entra desde abajo.
- Tarjeta → detalle: la tarjeta se convierte en la cabecera (View Transitions, ya presentes).
- Nada se mueve solo en las listas. `prefers-reduced-motion` lo apaga todo (regla global existente).

### Imágenes
Patrón SVG propio por área (pulso, monedas, puntos, círculos, trazos, ondas, escalones) en tarjetas y cabeceras. Ilustración plana para estados vacíos y "¡Meta creada!": un camino punteado con etapas de colores y banderín. Nada de fotos ni imágenes generadas.

## Alcance
Todas las pantallas: Hoy, sesión, Metas, detalle, meta creada, ideas, asistente, onboarding, revisión, Hábitos, detalle de hábito, Agenda, Progreso, Aprender, Notas, Perfil, acceso. Claro y oscuro, 360 a 1440 px.

## Verificación
- `npm run check:contrast`: contraste de cada par texto/superficie del sistema de color, en ambos temas.
- Capturas automáticas con Playwright de cada ruta (390, 768 y 1280 px; claro y oscuro) con Supabase simulado a nivel de red: sesión falsa y datos de prueba, sin tocar el proyecto real ni usar credenciales.
- typecheck, lint, tests, build, `check:api`, `check:rls`; sin errores nuevos en consola.

## Alternativas descartadas
- **Viva** (franja con patrón sobre superficie gris) y **sobria** (solo ícono y barra): más seguras, pero no resuelven la sensación de app apagada.
- **Texto siempre blanco**: con lima, amarillo y celeste queda por debajo de 3:1, ilegible al sol.
