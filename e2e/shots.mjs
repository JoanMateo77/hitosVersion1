/* global process, console */
/**
 * npm run shots [-- --routes /metas,/ ] [-- --allow-fonts]
 * Corre e2e/shots.spec.ts con Playwright (que levanta su propio Vite en 5199
 * con Supabase falso). SHOTS_LABEL=antes|despues elige la carpeta de salida.
 */
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const env = { ...process.env }
const passthrough = []

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--routes') env.SHOTS_ROUTES = args[++i] ?? ''
  else if (arg.startsWith('--routes=')) env.SHOTS_ROUTES = arg.slice('--routes='.length)
  else if (arg === '--allow-fonts') env.SHOTS_ALLOW_FONTS = '1'
  else passthrough.push(arg)
}

console.log(
  `Capturas → label "${env.SHOTS_LABEL || 'despues'}"` +
    (env.SHOTS_ROUTES ? `, rutas: ${env.SHOTS_ROUTES}` : ', todas las rutas'),
)

const child = spawn('npx', ['playwright', 'test', '-c', 'e2e/playwright.config.ts', ...passthrough], {
  stdio: 'inherit',
  env,
})
child.on('exit', (code) => process.exit(code ?? 1))
