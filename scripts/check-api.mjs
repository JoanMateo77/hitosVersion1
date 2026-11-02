// Comprueba que las funciones de Vercel (api/*.ts) CARGAN en Node como en
// producción: Vercel compila archivo por archivo, sin empaquetar, y con
// "type": "module" Node exige la extensión en los imports relativos
// ('./x.js'). Sin esto, la función revienta al arrancar (FUNCTION_INVOCATION_FAILED)
// aunque typecheck, tests y build pasen.
import { build } from 'esbuild'
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const tsIn = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(dir, f))

const apis = tsIn('api')
const out = mkdtempSync(join(tmpdir(), 'check-api-'))
try {
  cpSync('package.json', join(out, 'package.json'))
  await build({
    entryPoints: [...apis, ...tsIn('src/server'), ...tsIn('src/domain')],
    outdir: out,
    outbase: '.',
    format: 'esm',
    platform: 'node',
    logLevel: 'error',
  })
  const failed = []
  for (const file of apis) {
    const js = join(out, file.replace(/\.ts$/, '.js'))
    try {
      await import(pathToFileURL(js).href)
    } catch (err) {
      failed.push(`${file}: ${err.code ?? ''} ${String(err.message).split('\n')[0]}`)
    }
  }
  if (failed.length > 0) {
    console.error('Funciones que no cargan en Node (¿falta ".js" en un import relativo?):')
    for (const f of failed) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log(`API OK (${apis.length} ${apis.length === 1 ? 'función carga' : 'funciones cargan'} en Node)`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
