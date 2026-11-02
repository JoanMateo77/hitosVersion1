import { useId, useState, type KeyboardEvent } from 'react'
import { CUSTOM_TYPE_KEY } from '@/domain/goalType'
import { TEMPLATES, getTemplate } from '@/domain/templates'
import { nicheAccent } from '@/lib/nicheAccent'
import { NicheIcon } from '@/components/NicheGlyph'
import { IconCheck, IconSparkle } from '@/components/icons'
import { CoachOrb } from '@/components/coach/CoachChatView'
import { TYPE_NOTE_MAX, type TypeSuggestionDraft } from '@/components/wizard/typeDraft'

interface TypeStepProps {
  /** Tipo elegido ('' = ninguno todavía). */
  templateKey: string
  /** Lo que sugerimos: palabras clave al principio, la IA cuando responde. */
  suggestion: TypeSuggestionDraft | null
  /** La IA está leyendo la meta. */
  reading: boolean
  typeNote: string
  onPick: (key: string) => void
  onTypeNote: (note: string) => void
}

/**
 * Paso "¿Qué tipo de meta es?": una sugerencia destacada con el color de su
 * área, alternativas, el resto de tipos plegados y, siempre a la vista, una
 * salida para describirla con sus palabras. Todo es un único radiogroup (sin
 * tipos repetidos) que se recorre con flechas.
 */
export function TypeStep({ templateKey, suggestion, reading, typeNote, onPick, onTypeNote }: Readonly<TypeStepProps>) {
  const noteId = useId()
  const featuredKey = suggestion && suggestion.key !== CUSTOM_TYPE_KEY ? suggestion.key : null
  const altKeys = featuredKey ? (suggestion?.alternatives ?? []) : []
  const shown = new Set([featuredKey, ...altKeys].filter(Boolean))
  const rest = TEMPLATES.filter((t) => !shown.has(t.key))
  // Plegado si hay una sugerencia clara; abierto si no la hay o si lo elegido
  // vive ahí. Cuando la persona lo abre o cierra, manda su elección (null = auto).
  const [open, setOpen] = useState<boolean | null>(null)
  const autoOpen = !featuredKey || (templateKey !== '' && !shown.has(templateKey))
  const gridOpen = !featuredKey || (open ?? autoOpen)

  // Radio enfocable: el elegido si está a la vista; si no, el primero.
  const visibleKeys = [...(featuredKey ? [featuredKey] : []), ...altKeys, ...(gridOpen ? rest.map((t) => t.key) : [])]
  const tabKey = visibleKeys.includes(templateKey) ? templateKey : visibleKeys[0]

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    if (!delta || !(e.target instanceof HTMLElement) || e.target.getAttribute('role') !== 'radio') return
    const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')].filter(
      (el) => el.getClientRects().length > 0,
    )
    const i = radios.indexOf(e.target)
    if (i < 0) return
    e.preventDefault()
    const next = radios[(i + delta + radios.length) % radios.length]
    next.focus()
    if (next.dataset.key) onPick(next.dataset.key)
  }

  const card = (key: string, variant: 'featured' | 'alt' | 'tile') => (
    <TypeCard
      key={key}
      typeKey={key}
      variant={variant}
      selected={templateKey === key}
      focusable={tabKey === key}
      reason={variant === 'featured' && suggestion?.source === 'ai' ? suggestion.reason : ''}
      onPick={onPick}
    />
  )

  return (
    <div className="type-step">
      {/* La región viva existe desde el inicio (vacía): así el lector de
          pantalla anuncia el texto cuando llega, no se monta junto con él. */}
      <p className="type-step__reading" role="status">
        {reading && (
          <>
            <CoachOrb thinking size={24} />
            El coach está leyendo tu meta…
          </>
        )}
      </p>

      <div role="radiogroup" aria-label="Tipo de meta" className="type-step__group" onKeyDown={onKeyDown}>
        {featuredKey && (
          <div className="type-step__featured">
            <span className="section-title">Parece una meta de…</span>
            {card(featuredKey, 'featured')}
          </div>
        )}
        {altKeys.length > 0 && (
          <div className="stack stack--sm">
            <span className="section-title">También podría ser</span>
            <div className="type-alts">{altKeys.map((k) => card(k, 'alt'))}</div>
          </div>
        )}
        {featuredKey ? (
          <details
            className="type-all"
            open={gridOpen}
            onToggle={(e) => {
              // Solo cuenta el gesto de la persona, no los cambios que hace React.
              if (e.currentTarget.open !== gridOpen) setOpen(e.currentTarget.open)
            }}
          >
            <summary className="type-all__summary">Ver todos los tipos</summary>
            <div className="type-grid">{rest.map((t) => card(t.key, 'tile'))}</div>
          </details>
        ) : (
          <div className="type-all stack stack--sm">
            <span className="section-title">Elige el que más se parezca</span>
            <div className="type-grid">{rest.map((t) => card(t.key, 'tile'))}</div>
          </div>
        )}
      </div>

      <div className={`type-note${templateKey === CUSTOM_TYPE_KEY && typeNote.trim() ? ' type-note--on' : ''}`}>
        <label htmlFor={noteId} className="type-note__label">
          ¿Ninguno encaja?
        </label>
        <input
          id={noteId}
          className="input"
          placeholder="Descríbela con tus palabras"
          value={typeNote}
          maxLength={TYPE_NOTE_MAX}
          onChange={(e) => onTypeNote(e.target.value)}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="done"
          aria-describedby={`${noteId}-hint`}
        />
        <span id={`${noteId}-hint`} className="type-note__hint">
          La guardamos como meta personalizada y el coach la tiene en cuenta.
        </span>
      </div>
    </div>
  )
}

function TypeCard({
  typeKey,
  variant,
  selected,
  focusable,
  reason,
  onPick,
}: Readonly<{
  typeKey: string
  variant: 'featured' | 'alt' | 'tile'
  selected: boolean
  focusable: boolean
  reason: string
  onPick: (key: string) => void
}>) {
  const descId = useId()
  const t = getTemplate(typeKey)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={t.label}
      aria-describedby={descId}
      tabIndex={focusable ? 0 : -1}
      data-key={t.key}
      className={`type-card type-card--${variant}${selected ? ' type-card--on' : ''}`}
      style={nicheAccent(t.defaultArea)}
      onClick={() => onPick(t.key)}
    >
      <span className="type-card__glyph" aria-hidden="true">
        <NicheIcon area={t.defaultArea} size={variant === 'featured' ? 24 : 20} />
      </span>
      <span className="type-card__body">
        <span className="type-card__label">{t.label}</span>
        <span id={descId} className="type-card__desc">
          {t.description}
          {reason && (
            <span className="type-card__reason">
              <IconSparkle size={13} /> {reason}
            </span>
          )}
        </span>
      </span>
      <span className="type-card__check" aria-hidden="true">
        {selected && <IconCheck size={18} />}
      </span>
    </button>
  )
}
