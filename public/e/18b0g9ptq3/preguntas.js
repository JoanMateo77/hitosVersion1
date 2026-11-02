// Preguntas de la encuesta: las usan encuesta.html y resultados.html.
/*
 * PREGUNTAS DE LA ENCUESTA — edita solo esta lista.
 *
 * Cada elemento es una pregunta y se numera en el orden en que aparece.
 *   id      texto corto único (sin espacios); se usa para guardar la respuesta.
 *   tipo    'imagenes' → comparación con capturas (sale como sección arriba y en el resumen).
 *           'opciones' → elegir una opción sin imagen (sale solo en "Tu respuesta").
 *           'texto'    → respuesta libre (sale solo en "Tu respuesta").
 *   titulo  la pregunta (también es la etiqueta del texto copiado).
 *   ayuda   frase opcional bajo el título.
 *   opciones (para 'imagenes' y 'opciones'): lista de
 *           { letra, nombre, desc?, img?, imgOscuro?, alt?, altOscuro? }
 *           img / imgOscuro son rutas relativas dentro de img/ (deja la imagen en esa carpeta).
 *           Si alguna opción trae imgOscuro, se agrega una fila "En tema oscuro".
 *
 * Para AGREGAR una opción a una pantalla (p. ej. una propuesta "C · Nuevo" en Hoy):
 *   1. Copia la captura a img/ (p. ej. img/hoy-nuevo.webp).
 *   2. Añade { letra: 'C', nombre: 'Nuevo', img: 'img/hoy-nuevo.webp', alt: 'Describe lo que se ve' }
 *      dentro de opciones de la pregunta 'hoy'. Las columnas se ajustan solas.
 * Para agregar una pregunta nueva, añade otro objeto a la lista con un id distinto.
 */
globalThis.PREGUNTAS = [
  { id: 'metas', tipo: 'imagenes', titulo: 'Tus metas (lista)', principal: true,
    ayuda: 'La pregunta principal. Son bocetos del estudio de color (B a G), la lista como quedó en la app (H) y la de antes (A), solo como referencia. Todas se pueden elegir.',
    opciones: [
      { letra: 'A', nombre: 'Antes, como referencia', desc: 'Tarjetas blancas; el color solo en un ícono tenue.',
        img: 'img/metas-antes.webp', imgOscuro: 'img/metas-antes-oscuro.webp',
        alt: 'Lista de metas del diseño anterior: tarjetas blancas con ícono de color tenue y barra verde.' },
      { letra: 'B', nombre: 'Sobria', desc: 'Ícono sólido, barra y borde del color del área; estados en verde/ámbar. Superficies iguales.',
        img: 'img/lista-sobria.webp', imgOscuro: 'img/lista-sobria-oscuro.webp',
        alt: 'Boceto Sobria: tarjetas neutras con ícono sólido de color, borde y barra del color de cada meta.' },
      { letra: 'C', nombre: 'Viva', desc: 'Además una franja con patrón propio por área y la cabecera del detalle teñida.',
        img: 'img/lista-viva.webp', imgOscuro: 'img/lista-viva-oscuro.webp',
        alt: 'Boceto Viva: tarjetas blancas con una franja superior de color con patrón propio y el ícono superpuesto.' },
      { letra: 'D', nombre: 'Full color · Tarjeta entera', desc: 'Cada meta es un bloque de su color. Máxima energía.',
        img: 'img/lista-full-a.webp', imgOscuro: 'img/lista-full-a-oscuro.webp',
        alt: 'Boceto Full color, tarjeta entera: cada tarjeta es un bloque de color plano con texto blanco.' },
      { letra: 'E', nombre: 'Full color · Con profundidad', desc: 'Igual, con una luz suave arriba a la izquierda y el tono más hondo abajo. Menos plano, más “objeto”.',
        img: 'img/lista-full-b.webp', imgOscuro: 'img/lista-full-b-oscuro.webp',
        alt: 'Boceto Full color con profundidad: tarjetas de color con degradado de luz arriba y tono más oscuro abajo.' },
      { letra: 'F', nombre: 'Full color · Tapa de color', desc: 'Solo la cabecera va pintada; datos y barra sobre fondo neutro. Se lee más fácil con muchas metas.',
        img: 'img/lista-full-c.webp', imgOscuro: 'img/lista-full-c-oscuro.webp',
        alt: 'Boceto Full color, tapa de color: solo la cabecera de cada tarjeta es de color; datos y barra sobre fondo neutro.' },
      { letra: 'G', nombre: 'Full color · Acento con relieve', desc: 'Tarjeta neutra con relieve; el color va en el ícono, la barra gruesa y los estados. La más calmada.',
        img: 'img/lista-full-d.webp', imgOscuro: 'img/lista-full-d-oscuro.webp',
        alt: 'Boceto Full color, acento con relieve: tarjetas neutras con relieve; color en el ícono, la barra gruesa y los estados.' },
      { letra: 'H', nombre: 'Así quedó en la app', desc: 'Cada meta con su propio color y, si quieres, foto de portada.',
        img: 'img/metas-ahora.webp', imgOscuro: 'img/metas-ahora-oscuro.webp',
        alt: 'Lista de metas en la app actual: cada meta es una tarjeta de su propio color y una tiene foto de portada.' },
    ] },
  { id: 'meta-detalle', tipo: 'imagenes', titulo: 'Detalle de una meta', ayuda: 'Lo que ves al abrir una meta. B, C y D son bocetos; E es como quedó en la app.',
    opciones: [
      { letra: 'A', nombre: 'Antes', desc: 'Cabecera clara, sin color propio.', img: 'img/meta-detalle-antes.webp',
        alt: 'Detalle de meta, diseño anterior: cabecera clara con el título, etapa actual, compromiso, camino y notas.' },
      { letra: 'B', nombre: 'Sobria', desc: 'Ícono sólido, barra y borde del color del área; estados en verde/ámbar. Superficies iguales.', img: 'img/detalle-sobria.webp',
        alt: 'Boceto Sobria del detalle: cabecera neutra, ícono sólido verde y barra de etapas en verde.' },
      { letra: 'C', nombre: 'Viva', desc: 'Además una franja con patrón propio por área y la cabecera del detalle teñida.', img: 'img/detalle-viva.webp',
        alt: 'Boceto Viva del detalle: cabecera teñida de verde claro con patrón, etapa actual y semana.' },
      { letra: 'D', nombre: 'Full color', desc: 'Tarjetas planas del color del área, saturado (no neón), texto blanco y botones con relieve que se hunden al tocarlos.', img: 'img/detalle-full.webp',
        alt: 'Boceto Full color del detalle: cabecera verde plena con título blanco y botón verde con relieve.' },
      { letra: 'E', nombre: 'Así quedó en la app', desc: 'Cabecera con la foto de portada y el color de la meta.', img: 'img/meta-detalle-ahora.webp',
        alt: 'Detalle de meta en la app actual: cabecera con foto de portada y título en blanco; botones y barras en el verde de la meta.' },
    ] },
  { id: 'hoy', tipo: 'imagenes', titulo: 'Hoy', ayuda: 'La pantalla de inicio: tu día, tus metas y tu siguiente paso.',
    opciones: [
      { letra: 'A', nombre: 'Antes', img: 'img/hoy-antes.webp', imgOscuro: 'img/hoy-antes-oscuro.webp',
        alt: 'Hoy, diseño anterior: tarjetas blancas, metas con un borde de color fino y la siguiente sesión en un recuadro azul claro.',
        altOscuro: 'Hoy, diseño anterior en tema oscuro.' },
      { letra: 'B', nombre: 'Ahora', desc: 'Cada meta con su color y foto de portada.', img: 'img/hoy-ahora.webp', imgOscuro: 'img/hoy-ahora-oscuro.webp',
        alt: 'Hoy, diseño actual: las metas son tarjetas de color pleno (una con foto de portada) y la siguiente sesión lleva la cabecera del color de su meta.',
        altOscuro: 'Hoy, diseño actual en tema oscuro, con las tarjetas de meta en color pleno.' },
    ] },
  { id: 'habitos', tipo: 'imagenes', titulo: 'Hábitos', ayuda: 'Tus hábitos del día y de la semana.',
    opciones: [
      { letra: 'A', nombre: 'Antes', img: 'img/habitos-antes.webp', alt: 'Hábitos, diseño anterior: lista de hábitos con su avance de la semana.' },
      { letra: 'B', nombre: 'Ahora', img: 'img/habitos-ahora.webp', alt: 'Hábitos, diseño actual: lista de hábitos con su avance de la semana.' },
    ] },
  { id: 'notas', tipo: 'imagenes', titulo: 'Notas', ayuda: 'Tus notas sueltas y de cada meta.',
    opciones: [
      { letra: 'A', nombre: 'Antes', img: 'img/notas-antes.webp', alt: 'Notas, diseño anterior: pestañas Bandeja, Metas, Áreas e Ideas, buscador y una nota en la bandeja.' },
      { letra: 'B', nombre: 'Ahora', img: 'img/notas-ahora.webp', alt: 'Notas, diseño actual: pestañas Bandeja, Metas, Áreas e Ideas, buscador y una nota con relieve; botón Nota en azul con relieve.' },
    ] },
  { id: 'agenda', tipo: 'imagenes', titulo: 'Agenda', ayuda: 'Tu semana por bloques de tiempo.',
    opciones: [
      { letra: 'A', nombre: 'Antes', img: 'img/agenda-antes.webp', alt: 'Agenda, diseño anterior: el día por bloques de mañana, tarde y noche.' },
      { letra: 'B', nombre: 'Ahora', img: 'img/agenda-ahora.webp', alt: 'Agenda, diseño actual: el día por bloques de mañana, tarde y noche, cada bloque teñido con el color de su meta.' },
    ] },
  { id: 'perfil', tipo: 'imagenes', titulo: 'Perfil', ayuda: 'Tu cuenta y tus ajustes.',
    opciones: [
      { letra: 'A', nombre: 'Antes', img: 'img/perfil-antes.webp', alt: 'Perfil, diseño anterior: datos de la cuenta y ajustes.' },
      { letra: 'B', nombre: 'Ahora', img: 'img/perfil-ahora.webp', alt: 'Perfil, diseño actual: datos de la cuenta y ajustes.' },
    ] },
  { id: 'portada', tipo: 'opciones', titulo: '¿Te gustaría poner una foto de portada a tus metas?',
    opciones: [ { letra: 'Sí', nombre: 'Sí' }, { letra: 'No', nombre: 'No' }, { letra: '?', nombre: 'Me da igual' } ] },
  { id: 'color-propio', tipo: 'opciones', titulo: '¿Te sirve que cada meta tenga su propio color?',
    opciones: [ { letra: 'Sí', nombre: 'Sí, me ayuda a ubicarlas' }, { letra: 'No', nombre: 'No, prefiero algo más sobrio' }, { letra: '?', nombre: 'Me da igual' } ] },
  { id: 'frase', tipo: 'texto', titulo: 'En una frase: ¿qué cambiarías o qué te gustó más?' },
]
