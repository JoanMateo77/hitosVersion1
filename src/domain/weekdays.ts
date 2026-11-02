/**
 * Nombres de los días, lunes primero (índice 0 = lunes). Única fuente para
 * toda la app: tiras de semana, chips de días, cabeceras de agenda.
 */

/** Forma corta, para tiras y chips compactos: "Lu", "Ma", "Mi"… */
export const WEEKDAY_SHORT = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'] as const

/** Abreviatura, para cabeceras con más espacio (agenda): "Lun", "Mar", "Mié"… */
export const WEEKDAY_ABBR = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
