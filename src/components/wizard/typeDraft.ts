import { CUSTOM_TYPE_KEY, TYPE_REASON_MAX, type GoalTypeSuggestion } from '@/domain/goalType'
import type { QuestionAnswer } from '@/domain/goalPlan'
import { TEMPLATES, getTemplate } from '@/domain/templates'

/**
 * Lógica pura del paso "¿Qué tipo de meta es?": validación del borrador y cómo
 * llega la descripción libre ("Otra: …") al coach. Sin React, para testearla.
 */

/** Largo máximo de la descripción libre del tipo. */
export const TYPE_NOTE_MAX = 120

/** Pregunta con la que la descripción libre viaja en las respuestas del coach. */
export const TYPE_QUESTION = '¿Qué tipo de meta es?'

/** Sugerencia de tipo y de dónde salió: palabras clave del título o la IA. */
export interface TypeSuggestionDraft extends GoalTypeSuggestion {
  source: 'keywords' | 'ai'
}

const VALID_KEYS = new Set(TEMPLATES.map((t) => t.key))

export function isTemplateKey(key: unknown): key is string {
  return typeof key === 'string' && VALID_KEYS.has(key)
}

/** Sugerencia por palabras clave (sin razón ni alternativas). */
export function keywordSuggestion(key: string): TypeSuggestionDraft {
  return { key, reason: '', alternatives: [], source: 'keywords' }
}

/** Sugerencia de la IA ya validada por el servidor; se re-filtra por si acaso. */
export function aiSuggestion(s: GoalTypeSuggestion): TypeSuggestionDraft | null {
  if (!isTemplateKey(s.key)) return null
  return {
    key: s.key,
    reason: typeof s.reason === 'string' ? s.reason.trim().slice(0, TYPE_REASON_MAX) : '',
    alternatives: [...new Set(Array.isArray(s.alternatives) ? s.alternatives.filter(isTemplateKey) : [])]
      .filter((k) => k !== s.key && k !== CUSTOM_TYPE_KEY)
      .slice(0, 2),
    source: 'ai',
  }
}

/** Campos del paso de tipo leídos de un borrador desconocido (sessionStorage). */
export interface TypeDraftFields {
  /** Solo si es un tipo del catálogo; '' (ninguno) se deja al valor por defecto. */
  templateKey?: string
  typeNote?: string
  typePicked?: boolean
  typeSuggestion?: TypeSuggestionDraft
}

export function parseTypeDraft(d: Record<string, unknown>): TypeDraftFields {
  const out: TypeDraftFields = {}
  if (isTemplateKey(d.templateKey)) out.templateKey = d.templateKey
  // La descripción libre solo vive con el tipo personalizada: con otro tipo es basura.
  if (typeof d.typeNote === 'string' && out.templateKey === CUSTOM_TYPE_KEY) {
    out.typeNote = d.typeNote.slice(0, TYPE_NOTE_MAX)
  }
  if (typeof d.typePicked === 'boolean') out.typePicked = d.typePicked
  const suggestion = parseStoredSuggestion(d.typeSuggestion)
  if (suggestion) out.typeSuggestion = suggestion
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

/** Sugerencia guardada en el borrador: solo con tipo y origen válidos; se re-sanea como la de la IA. */
function parseStoredSuggestion(s: unknown): TypeSuggestionDraft | null {
  if (!isPlainObject(s)) return null
  const { key, source, reason, alternatives } = s
  if (!isTemplateKey(key) || (source !== 'ai' && source !== 'keywords')) return null
  const parsed = aiSuggestion({
    key,
    reason: typeof reason === 'string' ? reason : '',
    alternatives: Array.isArray(alternatives) ? alternatives.filter(isTemplateKey) : [],
  })
  return parsed ? { ...parsed, source } : null
}

/** La descripción libre solo cuenta si el tipo elegido es "personalizada". */
export function effectiveTypeNote(templateKey: string, typeNote: string): string {
  return (templateKey || CUSTOM_TYPE_KEY) === CUSTOM_TYPE_KEY ? typeNote.trim() : ''
}

/** Cómo se nombra el tipo ante el coach y en el resumen. */
export function typeLabelFor(templateKey: string, typeNote: string): string {
  const note = effectiveTypeNote(templateKey, typeNote)
  return note ? `Otra: ${note}` : getTemplate(templateKey || CUSTOM_TYPE_KEY).label
}

/** Respuestas que se guardan con la meta: la descripción libre va primero. */
export function answersWithTypeNote(
  answers: readonly QuestionAnswer[],
  templateKey: string,
  typeNote: string,
): QuestionAnswer[] {
  const note = effectiveTypeNote(templateKey, typeNote)
  return note ? [{ question: TYPE_QUESTION, answer: note }, ...answers] : [...answers]
}
