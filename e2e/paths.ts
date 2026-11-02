import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LABEL = (process.env.SHOTS_LABEL || 'despues').replace(/[^\w.-]/g, '_')
export const OUT_DIR = path.join(ROOT, 'docs/diseno/2026-11-02-color-metas/capturas', LABEL)
/** Partes del reporte (una por pantalla); el teardown las une en report.json. */
export const PARTS_DIR = path.join(ROOT, 'test-results', 'shots-report-parts', LABEL)
/** SHOTS_PORT permite correr varias tandas a la vez (una por agente o terminal). */
export const PORT = Number(process.env.SHOTS_PORT) || 5199
