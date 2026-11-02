import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { LABEL, OUT_DIR, PARTS_DIR } from './paths'

/** Une las partes de esta corrida en report.json (conserva rutas de corridas previas). */
export default function globalTeardown() {
  if (!existsSync(PARTS_DIR)) return
  const reportPath = path.join(OUT_DIR, 'report.json')
  let previous: { routes?: Record<string, unknown> } = {}
  try {
    previous = JSON.parse(readFileSync(reportPath, 'utf8'))
  } catch {
    /* primera corrida */
  }
  const routes: Record<string, unknown> = { ...(previous.routes ?? {}) }
  for (const file of readdirSync(PARTS_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const part = JSON.parse(readFileSync(path.join(PARTS_DIR, file), 'utf8'))
    routes[part.slug] = part
  }
  writeFileSync(
    reportPath,
    JSON.stringify({ label: LABEL, generatedAt: new Date().toISOString(), routes }, null, 2) + '\n',
  )
  console.log(`\nReporte: ${path.relative(process.cwd(), reportPath)}`)
}
