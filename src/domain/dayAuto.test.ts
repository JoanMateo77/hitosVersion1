import { describe, expect, it } from 'vitest'
import { autoDecision, type AutoInput } from '@/domain/dayAuto'

const ready: AutoInput = {
  auto: true,
  lastFromAi: true,
  messageCount: 2,
  usedAt: -1,
  addOnly: true,
  changes: 2,
  questions: 0,
  pending: false,
  saving: false,
  applied: false,
  error: false,
}

describe('autoDecision', () => {
  it('applies when the AI answered, nothing is asked and it only adds', () => {
    expect(autoDecision(ready)).toEqual({ apply: true, needsReview: false })
  })

  it('applies only once per AI reply (Undo does not re-apply)', () => {
    expect(autoDecision({ ...ready, usedAt: 2 }).apply).toBe(false)
    expect(autoDecision({ ...ready, usedAt: 2, messageCount: 4 }).apply).toBe(true)
  })

  it('waits while there are questions, and does not ask to review yet', () => {
    expect(autoDecision({ ...ready, questions: 1 })).toEqual({ apply: false, needsReview: false })
    expect(autoDecision({ ...ready, questions: 1, addOnly: false })).toEqual({ apply: false, needsReview: false })
  })

  it('never moves what the person had: asks to review instead', () => {
    expect(autoDecision({ ...ready, addOnly: false })).toEqual({ apply: false, needsReview: true })
  })

  it('does nothing while busy, after an error or once applied', () => {
    for (const busy of [{ pending: true }, { saving: true }, { error: true }, { applied: true }]) {
      expect(autoDecision({ ...ready, ...busy }).apply).toBe(false)
    }
    expect(autoDecision({ ...ready, applied: true, addOnly: false }).needsReview).toBe(false)
  })

  it('does nothing when off, before the AI answers or without changes', () => {
    expect(autoDecision({ ...ready, auto: false })).toEqual({ apply: false, needsReview: false })
    expect(autoDecision({ ...ready, lastFromAi: false }).apply).toBe(false)
    expect(autoDecision({ ...ready, changes: 0, addOnly: false })).toEqual({ apply: false, needsReview: false })
  })
})
