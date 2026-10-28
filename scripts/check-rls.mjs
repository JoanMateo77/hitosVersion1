// Falla si una tabla creada en supabase/ no activa RLS en el mismo archivo.
// Regla del proyecto: nunca una tabla sin RLS; RLS y políticas van en la misma migración.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const files = [
  'supabase/schema.sql',
  ...readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join('supabase/migrations', f)),
]

const name = String.raw`(?:public\.)?"?(\w+)"?`
const createRe = new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${name}`, 'gi')
const rlsRe = new RegExp(
  String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${name}\s+enable\s+row\s+level\s+security`,
  'gi',
)

const missing = []
for (const file of files) {
  const sql = readFileSync(file, 'utf8').replace(/--.*$/gm, '')
  const withRls = new Set([...sql.matchAll(rlsRe)].map((m) => m[1].toLowerCase()))
  for (const m of sql.matchAll(createRe)) {
    if (!withRls.has(m[1].toLowerCase())) missing.push(`${file}: ${m[1]}`)
  }
}

if (missing.length) {
  console.error('Tablas sin "enable row level security" en su mismo archivo:')
  for (const line of missing) console.error(`  - ${line}`)
  process.exit(1)
}
console.log(`RLS OK (${files.length} archivos revisados)`)
