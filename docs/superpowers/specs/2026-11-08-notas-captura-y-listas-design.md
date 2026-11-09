# Notas: escribir rápido, listas tipo Keep y deshacer

Fecha: 2026-11-08. Pedido del usuario: "mejorar el cómo anotamos las notas, siento
que del lado del front le falta". La evaluación previa encontró que la hoja no
pone el foco en nada, que Enter no funciona dentro de un elemento de la lista,
que las tarjetas aplanan las listas en una sola línea, que no hay forma de
deshacer, que no hay animaciones, que hay demasiados botones del mismo peso y que
no se ve cuándo quedó guardado. Todo lo de aquí se hace sin SQL: `items` ya es
`jsonb`.

## 1. Escribir rápido

- Al abrir una nota nueva, el foco cae en el cuerpo (o, si nace como lista, en
  "Agregar elemento"). El foco se pone al montar, dentro del mismo toque, para
  que iOS abra el teclado.
- Lista:
  - Enter dentro de un elemento lo parte en el cursor: lo de después pasa a un
    elemento nuevo debajo, con el foco al inicio.
  - Backspace al inicio de un elemento vacío lo quita y lleva el foco al final
    del anterior. Si el elemento tiene texto, lo une con el anterior.
  - Pegar varias líneas crea un elemento por línea.
- Se ve más como una nota y menos como un formulario: título sin borde y más
  liviano, cuerpo más grande.
- Acciones en una fila de íconos con su nombre accesible: Fijar, Lista, Mover y
  Archivar. Un menú "Más" junta Convertir en…, Desmarcar todo, Borrar marcados y
  Eliminar.
- Guardado automático 800 ms después de dejar de escribir, con un indicador
  "Guardando…" / "Guardado" junto a "Listo". Si falla, se sigue guardando al
  cerrar como hoy y se rescata lo escrito en `sessionStorage`.
- Una nota nueva que se guardó sola y luego se dejó vacía se elimina al cerrar,
  como si nunca se hubiera creado.

## 2. Listas tipo Keep

- Al marcar un elemento se tacha y, tras un instante, baja a "Marcados (n)",
  plegable y abierto por defecto. Al desmarcarlo vuelve a su lugar original: el
  orden guardado no cambia, solo cómo se muestra.
- La tarjeta muestra hasta 4 elementos sin marcar con su casilla, "+N más" y un
  contador "3/7". Se puede marcar desde la tarjeta, con un área de toque de
  44 px, sin abrir la nota.
- Pasar de lista a texto no pierde nada: un elemento marcado se escribe como
  "✓ texto" y uno con sangría lleva una tabulación delante. En el móvil no se
  teclea, así no se confunde con espacios escritos a mano. Al volver a lista se
  leen de nuevo.

## 3. Deshacer y captura

- El toast acepta una acción y una duración: "Deshacer" durante 5 s.
- Eliminar ya no pide confirmación. Borra al instante y "Deshacer" vuelve a
  insertar la misma nota (mismo id y fechas).
- Archivar y quitar un elemento con texto también ofrecen "Deshacer".
- Barra de captura sobre la lista ("Escribe una nota…" y un botón de lista): abre
  la hoja ya en el modo elegido.
- Accesos directos del ícono de la PWA: "Nueva nota" (`/notas?nueva=nota`) y
  "Nueva lista" (`/notas?nueva=lista`).

## 4. Ordenar y anidar

- Cada elemento tiene un asa para arrastrarlo dentro de los no marcados. Con
  teclado, las flechas arriba y abajo sobre el asa.
- Un nivel de sangría (`indented: true` en el elemento del `jsonb`):
  - Tab y Shift+Tab en el texto, o arrastrar el asa hacia los lados.
  - El primer elemento no puede tener sangría.
  - Marcar un elemento marca también sus hijos.
- Las llaves de los elementos en pantalla son ids que viven solo en la hoja y no
  se guardan, así guardar no cambia el contenido de la nota.

## Deuda que se paga

- Un solo camino de guardado: al salir, en segundo plano y automático.
- La hoja se parte en piezas: lista, barra de acciones y guardado.
- `listNotes` deja de ocultar que falta la migración 0017. Notas muestra el
  aviso; la sección de notas de una meta sigue quedando vacía en silencio.

## Fuera de alcance (necesitan SQL o una decisión de producto)

- Etiquetas, color por nota, recordatorios, imágenes y papelera.
