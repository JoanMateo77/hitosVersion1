import type { GoalTemplate, NicheId } from '@/lib/types'

/**
 * Mecanismo F — Plantillas pre-armadas por tipo de meta.
 *
 * Cada plantilla trae hitos típicos, un pool de acciones cortas y concretas
 * para el plan del día, y la frecuencia con la que la meta pide acción.
 * El usuario ajusta detalles; no inventa la estructura desde cero.
 */
export const TEMPLATES: GoalTemplate[] = [
  {
    key: 'salud_fisico',
    label: 'Mejorar mi físico / salud',
    emoji: '💪',
    defaultArea: 'salud',
    description: 'Bajar de peso, moverte más o crear un hábito saludable.',
    keywords: [
      'peso', 'adelgazar', 'bajar', 'kilos', 'gym', 'gimnasio', 'correr', 'caminar',
      'ejercicio', 'salud', 'físico', 'fisico', 'musculo', 'músculo', 'entrenar',
      'fuerza', 'cardio', 'dieta', 'comer', 'maratón', 'maraton', 'running', 'trotar',
      'pesas', 'yoga', 'pilates', 'nadar', 'natación', 'natacion', 'bici', 'bicicleta',
      'deporte', 'tonificar', 'abdominales', 'crossfit', 'spinning', 'flexiones',
    ],
    milestones: [
      'Definir tu punto de partida (peso, medidas o resistencia actual)',
      'Armar una rutina realista de 3 días por semana',
      'Sostenerla 4 semanas seguidas',
      'Subir la intensidad o sumar un tipo nuevo de ejercicio',
    ],
    actions: [
      'Caminar 30 min',
      'Hacer 20 min de fuerza',
      'Preparar una comida saludable',
      'Tomar 2 L de agua hoy',
      'Estirar 10 min al despertar',
      'Registrar lo que comiste hoy',
    ],
    kickoffActions: [
      'Anotar tu peso o medidas de hoy',
      'Elegir 3 días fijos para entrenar',
      'Dejar la ropa de ejercicio lista para mañana',
      'Caminar 15 min para arrancar',
      'Buscar una rutina simple para principiantes',
    ],
    cadence: 'weekdays',
    reviewEveryDays: 7,
  },
  {
    key: 'aprender_habilidad',
    label: 'Aprender una habilidad',
    emoji: '📚',
    defaultArea: 'aprendizaje',
    description: 'Un idioma, código, un instrumento, un oficio.',
    keywords: [
      'aprender', 'idioma', 'idiomas', 'inglés', 'ingles', 'francés', 'frances',
      'alemán', 'aleman', 'italiano', 'portugués', 'portugues', 'japonés', 'japones',
      'chino', 'programar', 'código', 'codigo', 'python', 'javascript', 'excel',
      'curso', 'estudiar', 'instrumento', 'guitarra', 'piano', 'batería', 'bateria',
      'habilidad', 'tocar', 'dibujar', 'fotografía', 'fotografia', 'cocinar', 'bailar',
      'cantar', 'skill',
    ],
    milestones: [
      'Elegir UN recurso principal (curso, libro o app)',
      'Definir cuántas horas por semana le vas a dar',
      'Completar el primer módulo o nivel',
      'Aplicar lo aprendido en algo real (proyecto, conversación)',
    ],
    actions: [
      'Estudiar 25 min (1 bloque)',
      'Repasar lo de ayer 15 min',
      'Completar 1 lección del curso',
      'Resolver 2 ejercicios',
      'Anotar 5 conceptos nuevos',
      'Aplicar lo aprendido en un mini ejercicio',
    ],
    kickoffActions: [
      'Elegir UN curso, libro o app y abrirlo',
      'Definir cuántas horas por semana le vas a dar',
      'Hacer la primera lección o capítulo',
      'Armar tu espacio de estudio',
      'Anotar por qué querés aprenderlo',
    ],
    cadence: 'weekdays',
    reviewEveryDays: 7,
  },
  {
    key: 'finanzas',
    label: 'Ahorrar / mejorar finanzas',
    emoji: '💰',
    defaultArea: 'finanzas',
    description: 'Ahorrar, ordenar gastos o salir de deudas.',
    keywords: [
      'ahorrar', 'ahorro', 'dinero', 'plata', 'finanzas', 'deuda', 'deudas', 'gastos',
      'presupuesto', 'invertir', 'inversión', 'inversion', 'bolsa', 'cripto', 'bitcoin',
      'jubilación', 'jubilacion', 'tarjeta', 'crédito', 'credito', 'económico',
      'economico', 'ingresos', 'fondo',
    ],
    milestones: [
      'Anotar tus ingresos y gastos de un mes',
      'Definir un monto de ahorro mensual realista',
      'Cortar 1 gasto innecesario recurrente',
      'Armar un fondo de emergencia inicial',
    ],
    actions: [
      'Registrar los gastos de hoy',
      'Revisar 1 suscripción y decidir si la cortás',
      'Transferir tu ahorro de la semana',
      'Comparar precios antes de una compra',
      'Anotar 1 idea de ingreso extra',
    ],
    kickoffActions: [
      'Anotar todos tus gastos de hoy',
      'Listar tus ingresos del mes',
      'Definir un monto de ahorro realista',
      'Revisar tus suscripciones activas',
      'Abrir una cuenta o app para el ahorro',
    ],
    cadence: 'thrice_week',
    reviewEveryDays: 7,
  },
  {
    key: 'carrera',
    label: 'Conseguir trabajo / cambiar de carrera',
    emoji: '🚀',
    defaultArea: 'carrera',
    description: 'Buscar empleo, cambiar de rumbo o crecer profesionalmente.',
    keywords: [
      'trabajo', 'empleo', 'laburo', 'laboral', 'carrera', 'cv', 'currículum',
      'curriculum', 'entrevista', 'linkedin', 'portafolio', 'profesional', 'ascenso',
      'ascender', 'promoción', 'promocion', 'freelance', 'cliente', 'clientes',
      'postular', 'postularme', 'vacante', 'reclutador', 'sueldo', 'renunciar',
    ],
    milestones: [
      'Actualizar tu CV y tu LinkedIn',
      'Definir 10 empresas o roles objetivo',
      'Aplicar a las primeras posiciones',
      'Preparar respuestas para entrevistas',
      'Conseguir la primera entrevista',
    ],
    actions: [
      'Aplicar a 1 vacante',
      'Mejorar 1 sección del CV',
      'Escribir a 1 contacto de tu red',
      'Practicar 1 respuesta de entrevista',
      'Investigar 1 empresa objetivo',
    ],
    kickoffActions: [
      'Actualizar tu CV',
      'Actualizar tu perfil de LinkedIn',
      'Listar 5 empresas o roles objetivo',
      'Definir qué tipo de trabajo querés',
      'Escribir a 1 contacto de tu red',
    ],
    cadence: 'weekdays',
    reviewEveryDays: 7,
  },
  {
    key: 'crear_publicar',
    label: 'Crear o publicar algo',
    emoji: '🎨',
    defaultArea: 'creatividad',
    description: 'Un libro, canal, portafolio o proyecto propio.',
    keywords: [
      'escribir', 'libro', 'canal', 'youtube', 'portafolio', 'proyecto', 'crear',
      'publicar', 'blog', 'podcast', 'arte', 'contenido', 'app', 'emprender',
      'emprendimiento', 'negocio', 'startup', 'marca', 'newsletter', 'instagram',
      'tiktok', 'novela', 'música', 'musica', 'disco', 'tienda', 'vender', 'ecommerce',
    ],
    milestones: [
      'Definir el alcance de tu v1 (lo mínimo publicable)',
      'Crear un plan de contenido o un índice',
      'Producir la primera pieza',
      'Publicarla',
      'Sostener una cadencia de publicación',
    ],
    actions: [
      'Trabajar 30 min en tu proyecto',
      'Crear 1 pieza pequeña',
      'Editar lo de ayer',
      'Publicar o compartir 1 avance',
      'Anotar 3 ideas nuevas',
    ],
    kickoffActions: [
      'Definir lo mínimo que querés publicar (v1)',
      'Reservar 30 min para arrancar hoy',
      'Anotar 5 ideas para empezar',
      'Armar un índice o plan de contenido',
      'Crear la primera pieza chica',
    ],
    cadence: 'thrice_week',
    reviewEveryDays: 7,
  },
  {
    key: 'academico',
    label: 'Meta académica',
    emoji: '🎓',
    defaultArea: 'aprendizaje',
    description: 'Graduarte, aprobar una materia, terminar la tesis.',
    keywords: [
      'tesis', 'materia', 'examen', 'graduar', 'graduarme', 'universidad', 'parcial',
      'académico', 'academico', 'monografía', 'monografia', 'facultad', 'aprobar',
      'oposiciones', 'oposición', 'oposicion', 'mba', 'doctorado', 'maestría',
      'maestria', 'posgrado', 'licenciatura', 'rendir', 'beca', 'toefl', 'ielts',
      'cursada',
    ],
    milestones: [
      'Listar todo lo que tenés que entregar o rendir',
      'Armar un cronograma con fechas',
      'Avanzar el primer bloque grande',
      'Repasar y cerrar',
      'Entregar o rendir',
    ],
    actions: [
      'Estudiar 1 bloque de 45 min',
      'Avanzar 1 sección de la tesis',
      'Resolver 1 práctica',
      'Hacer un resumen de lo visto',
      'Revisar el cronograma y ajustarlo',
    ],
    kickoffActions: [
      'Listar todo lo que tenés que entregar o rendir',
      'Armar un cronograma con fechas',
      'Juntar el material de estudio',
      'Estudiar el primer bloque de 45 min',
      'Definir tu meta de esta semana',
    ],
    cadence: 'weekdays',
    reviewEveryDays: 7,
  },
  {
    key: 'bienestar',
    label: 'Hábito de bienestar',
    emoji: '🌱',
    defaultArea: 'bienestar',
    description: 'Dormir mejor, leer, meditar, bajar el estrés.',
    keywords: [
      'dormir', 'sueño', 'sueno', 'leer', 'lectura', 'meditar', 'meditación',
      'meditacion', 'estrés', 'estres', 'bienestar', 'calma', 'rutina', 'mindfulness',
      'fumar', 'tabaco', 'vapear', 'ansiedad', 'terapia', 'gratitud', 'hábito',
      'habito', 'descansar', 'desconectar', 'respiración', 'respiracion',
    ],
    milestones: [
      'Elegir UN hábito y un horario fijo',
      'Sostenerlo 1 semana',
      'Sostenerlo 3 semanas',
      'Integrarlo sin esfuerzo',
    ],
    actions: [
      'Leer 10 páginas',
      'Meditar 10 min',
      'Apagar pantallas 30 min antes de dormir',
      'Escribir 3 cosas que agradecés',
      'Salir a tomar aire 15 min',
    ],
    kickoffActions: [
      'Elegir UN hábito y un horario fijo',
      'Dejar todo listo para hacerlo mañana',
      'Hacerlo hoy por primera vez',
      'Sacar una distracción de tu camino',
      'Anotar cómo te sentís al arrancar',
    ],
    cadence: 'daily',
    reviewEveryDays: 7,
  },
  {
    key: 'relaciones',
    label: 'Mejorar mis relaciones',
    emoji: '🤝',
    defaultArea: 'relaciones',
    description: 'Dedicar tiempo a la familia, la pareja o las amistades.',
    keywords: [
      'familia', 'pareja', 'amigos', 'amigas', 'relación', 'relacion', 'relaciones',
      'social', 'novia', 'novio', 'hijos', 'hijo', 'hija', 'vínculo', 'vinculo',
      'esposa', 'esposo', 'marido', 'padres', 'hermano', 'hermana', 'amistad',
      'citas', 'reconectar',
    ],
    milestones: [
      'Identificar a quién querés dedicarle más tiempo',
      'Agendar un momento fijo por semana',
      'Sostenerlo 1 mes',
      'Profundizar la conexión',
    ],
    actions: [
      'Llamar o escribir a alguien que querés',
      'Planear un momento juntos esta semana',
      'Preguntarle a alguien cómo está y escuchar',
      'Agradecerle algo a alguien hoy',
    ],
    kickoffActions: [
      'Elegir a quién querés dedicarle más tiempo',
      'Mandarle un mensaje hoy',
      'Agendar un momento juntos esta semana',
      'Llamar a alguien que extrañás',
      'Anotar qué te gustaría compartir',
    ],
    cadence: 'thrice_week',
    reviewEveryDays: 7,
  },
  {
    key: 'personalizada',
    label: 'Otra (la armo yo)',
    emoji: '🎯',
    defaultArea: 'otra',
    description: 'Cuando ninguna plantilla encaja. Vos definís los pasos.',
    keywords: [],
    milestones: [
      'Definir el resultado final concreto',
      'Partirlo en 3-4 hitos grandes',
      'Definir la primera acción de esta semana',
    ],
    actions: [
      'Avanzar 25 min en tu meta',
      'Definir el próximo paso concreto',
      'Revisar tu progreso',
    ],
    cadence: 'thrice_week',
    reviewEveryDays: 7,
  },
]

const TEMPLATE_BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]))

/** Plantilla por clave. Cae en 'personalizada' si la clave no existe (datos viejos). */
export function getTemplate(key: string): GoalTemplate {
  return TEMPLATE_BY_KEY.get(key) ?? TEMPLATE_BY_KEY.get('personalizada')!
}

/** Plantillas que sugiere por defecto un nicho (la propia primero). */
export function templatesForNiche(niche: NicheId): GoalTemplate[] {
  const own = TEMPLATES.filter((t) => t.defaultArea === niche && t.key !== 'personalizada')
  const rest = TEMPLATES.filter((t) => t.defaultArea !== niche)
  return [...own, ...rest]
}

/**
 * Detecta la plantilla más probable a partir del título de la meta contando
 * coincidencias de palabras clave. Es una sugerencia: el usuario siempre puede
 * cambiarla. Si no hay señal clara, devuelve 'personalizada'.
 */
export function detectTemplate(title: string): GoalTemplate {
  const text = ` ${title.toLowerCase()} `
  let best = getTemplate('personalizada')
  let bestScore = 0
  for (const template of TEMPLATES) {
    let score = 0
    for (const kw of template.keywords) {
      if (text.includes(kw)) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      best = template
    }
  }
  return best
}
