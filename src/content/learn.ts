import type { LearnCollection } from '@/lib/types'

/**
 * Contenido de la zona Aprender: micro-lecciones de crecimiento personal.
 *
 * Es contenido estático y curado (no viene de la base de datos) porque la
 * propuesta es editorial: pocas lecciones, bien escritas, cada una con una
 * acción aplicable hoy. El progreso de lectura vive en el cliente.
 */
export const LEARN_COLLECTIONS: LearnCollection[] = [
  {
    id: 'habitos-que-quedan',
    title: 'Hábitos que se quedan',
    blurb: 'Cómo construir rutinas que sobreviven a la motivación inicial.',
    area: 'bienestar',
    lessons: [
      {
        id: 'identidad-antes-que-resultados',
        title: 'Empieza por quién quieres ser',
        idea: 'Los hábitos que duran no nacen de "quiero correr 5 km", sino de "soy alguien que entrena". Cuando la meta es un resultado, el hábito muere al alcanzarlo o al frustrarte. Cuando la meta es una identidad, cada repetición es un voto a favor de esa persona, y los votos se acumulan aunque el resultado tarde.',
        apply: 'Escribe una frase con la identidad detrás de tu hábito más importante: "Soy una persona que ___". Ponla donde la veas al despertar y léela antes de decidir si hoy cumples.',
        cta: { kind: 'habit', title: 'Leer mi frase de identidad al despertar', area: 'bienestar' },
      },
      {
        id: 'regla-de-los-2-minutos',
        title: 'La regla de los 2 minutos',
        idea: 'Un hábito nuevo no fracasa por difícil: fracasa por grande. Reduce cualquier hábito a una versión que tome dos minutos: "meditar" se vuelve "sentarme y respirar tres veces"; "leer cada noche" se vuelve "leer una página". Al principio lo importante no es el resultado, es presentarte. Quien aparece dos minutos cada día puede después quedarse veinte.',
        apply: 'Elige el hábito que más has pospuesto y escribe su versión de 2 minutos. Hazla hoy, aunque te parezca ridículamente pequeña: esa incomodidad es la señal de que está bien diseñada.',
        cta: { kind: 'habit', title: 'Leer una página antes de dormir', area: 'aprendizaje' },
      },
      {
        id: 'apilar-habitos',
        title: 'Apila sobre lo que ya haces',
        idea: 'Tu día ya está lleno de hábitos que nunca fallan: prepararte el café, lavarte los dientes, cerrar la laptop. Esos momentos son anclas gratis. En vez de confiar en la memoria o en la motivación, engancha el hábito nuevo justo después de uno existente: "después de servirme el café, escribo mis tres prioridades".',
        apply: 'Completa hoy esta fórmula: "Después de [hábito que ya tengo], voy a [hábito nuevo de 2 minutos]". Pruébala esta misma tarde o mañana al despertar.',
        cta: { kind: 'habit', title: 'Escribir 3 prioridades después del café', area: 'carrera' },
      },
      {
        id: 'disena-el-entorno',
        title: 'Diseña el entorno, no la voluntad',
        idea: 'La fuerza de voluntad es un recurso que se agota; el entorno trabaja gratis las 24 horas. Hacemos lo que está a la vista y a un paso: si la fruta está en la mesa, la comes; si el celular está en el bolsillo, lo revisas. Cambiar el entorno una vez vale más que resistir la tentación cien veces.',
        apply: 'Haz un cambio físico hoy: deja a la vista lo que quieres hacer (el libro sobre la almohada, las zapatillas junto a la puerta) y ponle fricción a lo que quieres evitar (el celular cargando en otra habitación).',
        cta: { kind: 'habit', title: 'Dejar el celular fuera del cuarto en la noche', area: 'bienestar' },
      },
      {
        id: 'nunca-falles-dos-veces',
        title: 'Nunca falles dos veces',
        idea: 'Fallar un día no rompe un hábito; lo rompe la espiral de fallar el segundo, el tercero y rendirse. Un error es un accidente; dos seguidos son el inicio de un hábito nuevo: el de no hacerlo. La regla es simple: puedes fallar, pero nunca dos veces seguidas. Así cada tropiezo es un punto de retorno, no una caída.',
        apply: 'Si ayer dejaste caer un hábito, hazlo hoy en su versión mínima. No para compensar lo perdido, sino para cortar la racha de fallos en uno.',
      },
      {
        id: 'recompensa-inmediata',
        title: 'Dale al hábito un premio hoy',
        idea: 'Tu cerebro repite lo que se siente bien ahora, no lo que será bueno en un año. Los hábitos saludables tienen un problema: su recompensa llega tarde. La solución es añadir una recompensa inmediata —marcar la casilla, tachar el día, el podcast que solo escuchas mientras caminas—. La satisfacción de hoy financia la constancia de mañana.',
        apply: 'Elige una recompensa pequeña e inmediata para tu hábito principal y úsala hoy, justo al terminar. Marcarlo como cumplido en la app también cuenta: ese check existe para eso.',
      },
    ],
  },
  {
    id: 'constancia-sin-culpa',
    title: 'Constancia sin culpa',
    blurb: 'Sostener el ritmo sin castigarte cada vez que la vida se interpone.',
    area: 'bienestar',
    lessons: [
      {
        id: 'la-culpa-sabotea',
        title: 'La culpa no disciplina, frena',
        idea: 'Parece que sentirte mal por fallar te hará cumplir mañana, pero ocurre lo contrario: la culpa hace que evites pensar en el hábito, y lo que evitas no lo retomas. Quienes se perdonan tras un tropiezo vuelven antes que quienes se castigan. La culpa no es disciplina: es el impuesto que pagas por no volver.',
        apply: 'La próxima vez que falles, di una frase neutra: "No lo hice ayer. Hoy es otro día". Sin adjetivos sobre ti. Y luego haz la versión mínima del hábito.',
      },
      {
        id: 'imperfecto-pero-constante',
        title: 'Imperfecto y constante gana',
        idea: 'Diez minutos de ejercicio cuatro veces por semana construyen más que una sesión heroica de dos horas al mes. La perfección esporádica se siente épica pero no deja estructura; el progreso imperfecto se siente poca cosa pero se acumula. La pregunta correcta no es "¿lo hice perfecto?", sino "¿seguí en el juego?".',
        apply: 'Detecta dónde estás esperando condiciones perfectas (tiempo, energía, ánimo) y haz hoy la versión al 60%: la caminata corta, la sesión breve, el borrador feo.',
        cta: { kind: 'habit', title: 'Moverme 10 minutos al día', area: 'salud' },
      },
      {
        id: 'descanso-en-el-plan',
        title: 'El descanso es parte del plan',
        idea: 'Si descansar solo ocurre cuando colapsas, tu plan tiene un error de diseño. El descanso programado no es una pausa del progreso: es lo que lo hace sostenible, igual que dormir no es una pausa de estar vivo. Cuando el día libre está en el calendario, deja de ser una falla y se vuelve una pieza más del sistema.',
        apply: 'Decide hoy cuál es tu día o momento de descanso de la semana y trátalo con el mismo respeto que una sesión: no lo negocies ni lo llenes de pendientes.',
        cta: { kind: 'habit', title: 'Cerrar pantallas 30 min antes de dormir', area: 'bienestar' },
      },
      {
        id: 'volver-tras-una-pausa',
        title: 'Volver vale más que no parar',
        idea: 'Todo hábito de largo plazo incluye pausas: viajes, enfermedades, semanas imposibles. Lo que separa a quienes lo logran no es no parar nunca, sino volver rápido y sin drama. No intentes recuperar lo perdido en un día: eso convierte el regreso en castigo. Vuelve al nivel mínimo y sube desde ahí.',
        apply: 'Si tienes un hábito en pausa, agenda hoy su regreso: día, hora y versión mínima. El objetivo de la primera sesión de vuelta no es rendir, es romper el hielo.',
        cta: { kind: 'goal', title: 'Retomar mi rutina de ejercicio', area: 'salud' },
      },
      {
        id: 'mide-lo-que-si-hiciste',
        title: 'Cuenta lo que sí hiciste',
        idea: 'Al final del día tu memoria registra el pendiente que faltó, no las cinco cosas que sí hiciste. Ese sesgo te hace sentir que nunca avanzas, aunque avances. Medir lo cumplido —no lo que faltó— corrige la imagen y alimenta la motivación con datos reales en lugar de impresiones.',
        apply: 'Esta noche, antes de dormir, anota tres cosas que sí hiciste hoy, por pequeñas que sean. En papel o en notas: lo importante es verlas escritas.',
        cta: { kind: 'habit', title: 'Anotar 3 logros del día', area: 'bienestar' },
      },
    ],
  },
  {
    id: 'enfoque-real',
    title: 'Enfoque real',
    blurb: 'Recuperar tu atención en un mundo diseñado para robártela.',
    area: 'carrera',
    lessons: [
      {
        id: 'bloques-cortos-profundos',
        title: 'Profundo en bloques cortos',
        idea: 'No necesitas cuatro horas libres para hacer trabajo profundo; necesitas 25 minutos sin interrupciones. Un bloque corto con el teléfono lejos y una sola pestaña abierta produce más que una tarde entera de atención fragmentada. La profundidad no se mide en horas: se mide en ausencia de interrupciones.',
        apply: 'Agenda hoy un bloque de 25 minutos para tu tarea más importante: silencia notificaciones, cierra lo que no uses y trabaja en una sola cosa hasta que suene la alarma.',
        cta: { kind: 'habit', title: 'Un bloque de 25 min sin interrupciones', area: 'carrera' },
      },
      {
        id: 'una-sola-cosa',
        title: 'Una sola cosa a la vez',
        idea: 'La multitarea es una ilusión: el cerebro no hace dos tareas cognitivas a la vez, alterna entre ellas y pierde calidad en ambas. Trabajar en una sola cosa no es lentitud: es la forma más rápida de terminar. La pregunta útil cada mañana es: ¿cuál es la única cosa que, si la termino hoy, hace que el día haya valido?',
        apply: 'Elige ahora tu "única cosa" de hoy y trabájala antes de abrir el correo o la mensajería. Lo urgente puede esperar 25 minutos; lo importante no sobrevive al final del día.',
      },
      {
        id: 'costo-del-cambio-de-contexto',
        title: 'Cada cambio de contexto cobra peaje',
        idea: 'Revisar "solo un mensaje" no cuesta diez segundos: cuesta los quince o veinte minutos que tu cabeza tarda en volver a donde estaba. Es el residuo de atención: parte de tu mente se queda en la tarea anterior. Cinco interrupciones pequeñas pueden vaciar una mañana entera sin que nada parezca habérsela robado.',
        apply: 'Durante una hora de trabajo hoy, cuenta tus cambios de contexto: cada salto a otra app, pestaña o conversación, una raya en un papel. Solo medirlo ya cambia el comportamiento.',
        cta: { kind: 'habit', title: 'Revisar mensajes solo en 3 momentos del día', area: 'carrera' },
      },
      {
        id: 'decir-que-no',
        title: 'Decir que no es decir que sí',
        idea: 'Cada sí a algo pequeño es un no silencioso a tu trabajo importante: el tiempo no se estira. Decir que no no requiere excusas elaboradas; requiere claridad sobre qué estás protegiendo. Un "no puedo esta semana" amable y a tiempo es más respetuoso que un sí resentido que cumples a medias.',
        apply: 'Identifica un compromiso que aceptaste por inercia y renegócialo hoy: recórtalo, propón otra fecha o decláralo fuera de tu plato. Una conversación incómoda de dos minutos compra horas.',
      },
      {
        id: 'cerrar-el-dia',
        title: 'Cierra el día, abre el mañana',
        idea: 'El trabajo que termina "cuando ya no doy más" invade la noche y arranca mal el día siguiente. Un ritual de cierre cambia eso: revisas qué quedó abierto, decides la primera tarea de mañana y apagas. Así mañana no gastas tu mejor energía decidiendo por dónde empezar: ya lo decidió tu yo de hoy, que tenía el contexto fresco.',
        apply: 'Hoy, antes de cerrar la laptop, escribe la primera tarea concreta de mañana. Una sola, que puedas empezar en 5 minutos. Luego cierra de verdad.',
        cta: { kind: 'habit', title: 'Anotar la primera tarea de mañana al cerrar el día', area: 'carrera' },
      },
    ],
  },
]
