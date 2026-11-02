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
/**
 * Arma una pregunta de imágenes a partir de una tabla: una opción por línea,
 * columnas separadas por « | »:  letra | nombre | imagen | descripción | alt | alt en oscuro (opcional)
 * imagen es el nombre del archivo en img/ sin « .webp ». Con { oscuro: true } cada opción usa
 * también img/<imagen>-oscuro.webp y se agrega la fila « En tema oscuro ».
 */
function imagenes(id, titulo, ayuda, { principal = false, oscuro = false }, tabla) {
  const opciones = tabla.trim().split('\n').map((linea) => {
    const [letra, nombre, img, desc, alt, altOscuro] = linea.split(' | ').map((c) => c.trim())
    return {
      letra, nombre, desc, alt, altOscuro,
      img: `img/${img}.webp`,
      imgOscuro: oscuro ? `img/${img}-oscuro.webp` : undefined,
    }
  })
  return { id, tipo: 'imagenes', titulo, ayuda, principal, opciones }
}

globalThis.PREGUNTAS = [
  imagenes('metas', 'Tus metas (lista)', 'La pregunta principal. Son bocetos del estudio de color (B a G), la lista como quedó en la app (H) y la de antes (A), solo como referencia. Todas se pueden elegir.', { principal: true, oscuro: true }, `
    A | Antes, como referencia | metas-antes | Tarjetas blancas; el color solo en un ícono tenue. | Lista de metas del diseño anterior: tarjetas blancas con ícono de color tenue y barra verde.
    B | Sobria | lista-sobria | Ícono sólido, barra y borde del color del área; estados en verde/ámbar. Superficies iguales. | Boceto Sobria: tarjetas neutras con ícono sólido de color, borde y barra del color de cada meta.
    C | Viva | lista-viva | Además una franja con patrón propio por área y la cabecera del detalle teñida. | Boceto Viva: tarjetas blancas con una franja superior de color con patrón propio y el ícono superpuesto.
    D | Full color · Tarjeta entera | lista-full-a | Cada meta es un bloque de su color. Máxima energía. | Boceto Full color, tarjeta entera: cada tarjeta es un bloque de color plano con texto blanco.
    E | Full color · Con profundidad | lista-full-b | Igual, con una luz suave arriba a la izquierda y el tono más hondo abajo. Menos plano, más “objeto”. | Boceto Full color con profundidad: tarjetas de color con degradado de luz arriba y tono más oscuro abajo.
    F | Full color · Tapa de color | lista-full-c | Solo la cabecera va pintada; datos y barra sobre fondo neutro. Se lee más fácil con muchas metas. | Boceto Full color, tapa de color: solo la cabecera de cada tarjeta es de color; datos y barra sobre fondo neutro.
    G | Full color · Acento con relieve | lista-full-d | Tarjeta neutra con relieve; el color va en el ícono, la barra gruesa y los estados. La más calmada. | Boceto Full color, acento con relieve: tarjetas neutras con relieve; color en el ícono, la barra gruesa y los estados.
    H | Así quedó en la app | metas-ahora | Cada meta con su propio color y, si quieres, foto de portada. | Lista de metas en la app actual: cada meta es una tarjeta de su propio color y una tiene foto de portada.
  `),
  imagenes('meta-detalle', 'Detalle de una meta', 'Lo que ves al abrir una meta. B, C y D son bocetos; E es como quedó en la app.', {}, `
    A | Antes | meta-detalle-antes | Cabecera clara, sin color propio. | Detalle de meta, diseño anterior: cabecera clara con el título, etapa actual, compromiso, camino y notas.
    B | Sobria | detalle-sobria | Ícono sólido, barra y borde del color del área; estados en verde/ámbar. Superficies iguales. | Boceto Sobria del detalle: cabecera neutra, ícono sólido verde y barra de etapas en verde.
    C | Viva | detalle-viva | Además una franja con patrón propio por área y la cabecera del detalle teñida. | Boceto Viva del detalle: cabecera teñida de verde claro con patrón, etapa actual y semana.
    D | Full color | detalle-full | Tarjetas planas del color del área, saturado (no neón), texto blanco y botones con relieve que se hunden al tocarlos. | Boceto Full color del detalle: cabecera verde plena con título blanco y botón verde con relieve.
    E | Así quedó en la app | meta-detalle-ahora | Cabecera con la foto de portada y el color de la meta. | Detalle de meta en la app actual: cabecera con foto de portada y título en blanco; botones y barras en el verde de la meta.
  `),
  imagenes('hoy', 'Hoy', 'La pantalla de inicio: tu día, tus metas y tu siguiente paso.', { oscuro: true }, `
    A | Antes | hoy-antes |  | Hoy, diseño anterior: tarjetas blancas, metas con un borde de color fino y la siguiente sesión en un recuadro azul claro. | Hoy, diseño anterior en tema oscuro.
    B | Ahora | hoy-ahora | Cada meta con su color y foto de portada. | Hoy, diseño actual: las metas son tarjetas de color pleno (una con foto de portada) y la siguiente sesión lleva la cabecera del color de su meta. | Hoy, diseño actual en tema oscuro, con las tarjetas de meta en color pleno.
  `),
  imagenes('habitos', 'Hábitos', 'Tus hábitos del día y de la semana.', {}, `
    A | Antes | habitos-antes |  | Hábitos, diseño anterior: lista de hábitos con su avance de la semana.
    B | Ahora | habitos-ahora |  | Hábitos, diseño actual: lista de hábitos con su avance de la semana.
  `),
  imagenes('notas', 'Notas', 'Tus notas sueltas y de cada meta.', {}, `
    A | Antes | notas-antes |  | Notas, diseño anterior: pestañas Bandeja, Metas, Áreas e Ideas, buscador y una nota en la bandeja.
    B | Ahora | notas-ahora |  | Notas, diseño actual: pestañas Bandeja, Metas, Áreas e Ideas, buscador y una nota con relieve; botón Nota en azul con relieve.
  `),
  imagenes('agenda', 'Agenda', 'Tu semana por bloques de tiempo.', {}, `
    A | Antes | agenda-antes |  | Agenda, diseño anterior: el día por bloques de mañana, tarde y noche.
    B | Ahora | agenda-ahora |  | Agenda, diseño actual: el día por bloques de mañana, tarde y noche, cada bloque teñido con el color de su meta.
  `),
  imagenes('perfil', 'Perfil', 'Tu cuenta y tus ajustes.', {}, `
    A | Antes | perfil-antes |  | Perfil, diseño anterior: datos de la cuenta y ajustes.
    B | Ahora | perfil-ahora |  | Perfil, diseño actual: datos de la cuenta y ajustes.
  `),
  {id: 'portada', tipo: 'opciones', titulo: '¿Te gustaría poner una foto de portada a tus metas?', opciones: [{letra: 'Sí', nombre: 'Sí'},{letra: 'No', nombre: 'No'},{letra: '?', nombre: 'Me da igual'}]},
  {id: 'color-propio', tipo: 'opciones', titulo: '¿Te sirve que cada meta tenga su propio color?', opciones: [{letra: 'Sí', nombre: 'Sí, me ayuda a ubicarlas'},{letra: 'No', nombre: 'No, prefiero algo más sobrio'},{letra: '?', nombre: 'Me da igual'}]},
  {id: 'frase', tipo: 'texto', titulo: 'En una frase: ¿qué cambiarías o qué te gustó más?'},
]
