import { supabase } from '@/lib/supabase'

/** Ids de lecciones leídas por el usuario (sincronizadas entre dispositivos). */
export async function listLessonReads(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('lesson_reads')
    .select('lesson_id')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return new Set((data as { lesson_id: string }[]).map((r) => r.lesson_id))
}

/** Marca o desmarca una lección. Idempotente (PK user+lesson). */
export async function setLessonRead(
  userId: string,
  lessonId: string,
  read: boolean,
): Promise<void> {
  if (read) {
    const { error } = await supabase
      .from('lesson_reads')
      .upsert(
        { user_id: userId, lesson_id: lessonId },
        { onConflict: 'user_id,lesson_id', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('lesson_reads')
      .delete()
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
    if (error) throw new Error(error.message)
  }
}

/** Sube las lecturas locales que el servidor no tiene (migración suave). */
export async function pushLessonReads(userId: string, lessonIds: string[]): Promise<void> {
  if (lessonIds.length === 0) return
  const { error } = await supabase
    .from('lesson_reads')
    .upsert(
      lessonIds.map((lesson_id) => ({ user_id: userId, lesson_id })),
      { onConflict: 'user_id,lesson_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}
