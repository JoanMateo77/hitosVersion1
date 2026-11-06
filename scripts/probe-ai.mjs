// Mide cada eslabón de la cadena de IA por separado: cuántas respuestas válidas
// da y cuánto tarda. Sirve para decidir el orden de AI_CHAIN con datos.
// Uso: node --env-file=.env scripts/probe-ai.mjs [intentos por eslabón, por defecto 3]
// Solo manda un pedido mínimo sin datos de personas; no imprime claves.
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const tries = Math.max(1, Number(process.argv[2]) || 3)
const out = mkdtempSync(join(tmpdir(), 'probe-ai-'))
try {
  const file = join(out, 'aiChain.mjs')
  await build({ entryPoints: ['src/server/aiChain.ts'], bundle: true, outfile: file, format: 'esm', platform: 'node', logLevel: 'error' })
  const { parseChain, createModelChain, realChainOptions } = await import(pathToFileURL(file).href)

  const links = parseChain(process.env)
  if (links.length === 0) {
    console.log('No hay eslabones: define GEMINI_API_KEY, GROQ_API_KEY u OPENROUTER_API_KEY.')
    process.exit(1)
  }
  const req = {
    system: 'Respondes en español y solo con JSON.',
    prompt: 'Sugiere un nombre corto para una meta de correr 5 km.',
    schema: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] },
    maxOutputTokens: 1024,
  }
  const parse = (raw) => (raw && typeof raw.name === 'string' && raw.name.trim() ? raw.name : null)

  for (const link of links) {
    const reasons = []
    const times = []
    let ok = 0
    let firstOk = 0
    for (let i = 0; i < tries; i++) {
      // Cadena de un solo eslabón: el primer intento mide el eslabón tal cual y el
      // reintento final (sin espera aquí) muestra si un segundo intento lo salva.
      const failures = []
      const chain = createModelChain([link], { ...realChainOptions(), log: (l) => failures.push(l), sleep: async () => {}, budgetMs: 20_000 })
      const t0 = Date.now()
      try {
        await chain.run(req, parse)
        ok++
        if (failures.length === 0) firstOk++
        times.push(Date.now() - t0)
      } catch {
        // Fallo del eslabón: el motivo ya quedó en `failures`.
      }
      if (failures.length > 0) reasons.push(failures[0].split(' ')[2] ?? 'error')
    }
    const avg = times.length ? `${Math.round(times.reduce((a, b) => a + b, 0) / times.length)} ms` : '-'
    const why = reasons.length ? `  fallos: ${reasons.join(', ')}` : ''
    console.log(`${link.label.padEnd(36)} 1er intento ${firstOk}/${tries} · con reintento ${ok}/${tries} · ${avg}${why}`)
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}
