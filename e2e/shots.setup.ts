import { mkdirSync, rmSync } from 'node:fs'
import { OUT_DIR, PARTS_DIR } from './paths'

export default function globalSetup() {
  rmSync(PARTS_DIR, { recursive: true, force: true })
  mkdirSync(PARTS_DIR, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })
}
