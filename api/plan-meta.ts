// Función de Vercel: POST /api/plan-meta. Toda la lógica vive en src/server.
import { createPlanMetaHandler } from '../src/server/planMetaApp'

const handler = createPlanMetaHandler(process.env)

export function POST(request: Request): Promise<Response> {
  return handler(request)
}
