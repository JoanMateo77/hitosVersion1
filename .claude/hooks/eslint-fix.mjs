// Hook PostToolUse de Claude Code: tras editar un .ts/.tsx de src/, aplica
// `eslint --fix` y, si quedan errores, se los devuelve a Claude (exit 2).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf8'))
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const file = input.tool_input?.file_path
if (!file) process.exit(0)

const rel = relative(root, file)
if (!/^src\/.+\.tsx?$/.test(rel)) process.exit(0)

try {
  execFileSync('node_modules/.bin/eslint', ['--fix', rel], { cwd: root, stdio: 'pipe' })
} catch (error) {
  process.stderr.write(String(error.stdout || error.message))
  process.exit(2)
}
