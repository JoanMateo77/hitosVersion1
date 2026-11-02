# Color y portada de cada meta

Fecha: 2026-11-02 · Estado: aprobado por el usuario (paleta cerrada; foto propia; la persona elige si la foto va solo en la cabecera o también en la tarjeta).

## Problema
El color de una meta sale fijo de su área: dos metas de Finanzas son idénticas y la persona no puede hacerla "suya". Tampoco puede ponerle una imagen.

## Decisión

### Color elegido
- Paleta cerrada: los 8 tonos de área ya verificados (`--vivid-base-*`, tinta y relieve por tono). Se pueden sumar tonos nuevos solo si pasan `npm run check:contrast` (≥ 4.5:1 con su tinta, ≥ 25° OKLCH del azul de acción y de los estados, y distinguibles de los demás).
- Por defecto (columna vacía) la meta usa el color de su área, como hoy.
- El color elegido reemplaza al del área en todo lo que pinta la meta: tarjeta, cabecera, barras, etapa actual, notas de la meta, agenda. El ícono sigue siendo el del área (el área sigue diciendo de qué trata).
- Implementación: `goalAccent(goal)` publica las mismas variables que `nicheAccent` (`--vivid`, `--vivid-ink`, `--vivid-lip`, `--pat`) a partir de `goal.color ?? goal.area`. Todos los usos de `nicheAccent(goal.area)` que pintan una meta pasan a `goalAccent(goal)`.

### Portada (foto propia)
- La persona sube una foto desde el detalle de la meta (editar). Formatos jpeg, png, webp (y heic si el navegador lo decodifica); máx. 10 MB de entrada.
- En el cliente se redimensiona a 1600 px de lado mayor y se re-codifica a WebP (calidad ~0.8) con canvas. Esto también **borra los metadatos EXIF (incluida la ubicación GPS)**. Lo subido pesa ≤ 1.5 MB; si no se logra, se rechaza con un mensaje claro.
- Almacenamiento: bucket **privado** `goal-covers` en Supabase Storage; ruta `{uid}/{goalId}-{timestamp}.webp`. Políticas sobre `storage.objects`: cada usuario solo lee, sube, actualiza y borra en su carpeta. Límite de tamaño (`file_size_limit`) y tipos permitidos (`allowed_mime_types`: WebP y JPEG; JPEG porque Safari/iOS no codifica WebP desde canvas, y ambos se re-codifican sin EXIF) en el bucket. Se muestra con URL firmada de corta duración (1 h), nunca pública.
- Columnas nuevas en `goals`: `color text` (null o una clave de la paleta, con `check`), `cover_path text` (null = sin foto) y `cover_on_card boolean not null default false`. RLS de `goals` ya existente cubre las columnas; la migración no abre nada nuevo.
- Reemplazar la foto borra la anterior; quitarla borra el objeto y pone `cover_path` en null; eliminar la meta intenta borrar su foto (best effort, no bloquea).
- Dónde se ve: siempre en la cabecera del detalle si hay foto; en la tarjeta de Metas y de Hoy solo si la persona activa "Mostrar también en la tarjeta".
- Legibilidad: sobre foto el texto va en blanco con una capa oscura degradada (≥ 4.5:1 en la zona del texto, verificado con el peor caso: foto blanca). El color de la meta queda en el canto/relieve y en la barra.
- Accesibilidad: la foto es decorativa (`alt=""`); controles con etiqueta; la elección de color es un radiogroup con nombre accesible de cada tono.

## Fuera de alcance
- Banco de fotos externo o galería ilustrada.
- Recortar/encuadrar la foto (se usa `object-fit: cover` centrado).

## Migración
`supabase/migrations/0019_meta_color_portada.sql` — la corre el usuario en el SQL editor de Supabase. RLS y políticas en la misma migración.

## Verificación
- Tests: `goalAccent` (color elegido, fallback al área, clave inválida → área), validación de la clave de color, armado de la ruta de la portada, reducción de tamaño (función pura de dimensiones).
- `check:rls`, `check:contrast` (si se suman tonos), typecheck, lint, tests, build, `check:api`.
- Capturas: meta con color elegido distinto del área, con portada en cabecera y en tarjeta (fixtures del arnés con una imagen local), claro/oscuro, 390/1280.
