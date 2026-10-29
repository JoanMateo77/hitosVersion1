import type { NicheId, Note, NoteItem, NotePlace } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface NoteRow {
  id: string
  user_id: string
  title: string | null
  body: string
  items: NoteItem[] | null
  place: string
  goal_id: string | null
  area: string | null
  pinned: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    items: row.items ?? null,
    place: row.place as NotePlace,
    goalId: row.goal_id,
    area: (row.area as NicheId | null) ?? null,
    pinned: row.pinned,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** ¿El error de PostgREST es "esa tabla no existe"? (migración 0017 sin aplicar) */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

function failure(error: { code?: string; message: string }): Error {
  return new Error(
    isMissingTable(error) ? 'Falta aplicar la migración 0017 para usar Notas.' : error.message,
  )
}

export async function listNotes(userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) {
    if (isMissingTable(error)) return []
    throw new Error(error.message)
  }
  return (data as NoteRow[]).map(mapNote)
}

export interface NewNoteInput {
  title?: string | null
  body: string
  items?: NoteItem[] | null
  goalId?: string | null
}

export async function createNote(userId: string, input: NewNoteInput): Promise<Note> {
  const goalId = input.goalId ?? null
  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      title: input.title ?? null,
      body: input.body,
      items: input.items ?? null,
      place: goalId ? 'goal' : 'inbox',
      goal_id: goalId,
    })
    .select('*')
    .single()
  if (error) throw failure(error)
  return mapNote(data as NoteRow)
}

async function patchNote(id: string, patch: Record<string, unknown>): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw failure(error)
  return mapNote(data as NoteRow)
}

export function updateNote(
  id: string,
  patch: Partial<Pick<Note, 'title' | 'body' | 'items' | 'pinned'>>,
): Promise<Note> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.body !== undefined) row.body = patch.body
  if (patch.items !== undefined) row.items = patch.items
  if (patch.pinned !== undefined) row.pinned = patch.pinned
  return patchNote(id, row)
}

export type NoteDestination =
  | { place: 'inbox' | 'ideas' }
  | { place: 'goal'; goalId: string }
  | { place: 'area'; area: NicheId }

/** Mueve la nota a otro lugar; limpia los vínculos que ya no aplican. */
export function fileNote(id: string, to: NoteDestination): Promise<Note> {
  return patchNote(id, {
    place: to.place,
    goal_id: to.place === 'goal' ? to.goalId : null,
    area: to.place === 'area' ? to.area : null,
  })
}

export function setNoteArchived(id: string, archived: boolean): Promise<Note> {
  return patchNote(id, { archived_at: archived ? new Date().toISOString() : null })
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id)
  if (error) throw failure(error)
}
