# Asistente de metas: etapas con IA — diseño

Fecha: 2026-10-31 · Rama: `feat/asistente-ia` (sale de `feat/metas-flexibles-notas`) · Solo local

## Intención

El paso "Estas son tus etapas" se siente pesado: llega lleno de etapas genéricas de plantilla
("Completar el primer hito…") y con un menú `⋯` por fila. El usuario quiere armar las suyas desde
cero con facilidad y que la IA le proponga etapas pensadas para *su* meta.

Proveedor elegido con evidencia en `docs/analisis/reports/Proveedores IA para planes de metas.md`:
Gemini Flash-Lite; ahora con la clave gratuita **solo con datos de prueba** (el free tier entrena
con el contenido y no se permite para usuarios del EEE/UK). Antes de usuarios reales: nivel pago.

## Alcance de esta parte

1. **Servidor IA** `POST /api/plan-meta` (función de Vercel, firma Web `Request → Response`).
   - Exige sesión: valida el access token de Supabase contra `/auth/v1/user`.
   - Límite 10 planes/día por usuario. **En memoria** (sirve en local; antes de desplegar pasa a
     una tabla, ver Pendientes).
   - Clave `GEMINI_API_KEY` solo del lado servidor (sin prefijo `VITE_`). Modelo en
     `GEMINI_MODEL` (por defecto `gemini-3.5-flash-lite`).
   - Interfaz `GoalPlanner` con un adaptador Gemini (REST, `responseSchema`, razonamiento bajo,
     timeout 20 s). Cambiar de proveedor = otro adaptador.
   - Respuesta validada en el servidor (`parseGoalPlan`); JSON vacío, cortado o inválido → un
     reintento; si vuelve a fallar → 502 y el front sigue con las sugerencias de plantilla.
   - En local, un middleware de Vite monta el mismo handler (sin `vercel dev`).
2. **Plan de meta (JSON v1)**, dominio puro y testeado en `src/domain/goalPlan.ts`:
   `{ schemaVersion: 1, summary, weeklyMinutes, stages: [{ title, objective, weeks, firstActions[], successSignal }] }`,
   3–6 etapas (rango validado en el servidor, no en el esquema: varios proveedores no aceptan
   `minItems`/`maxItems`).
3. **Paso "Etapas"**:
   - Arranca vacío (ya no se siembran las etapas de la plantilla).
   - "Sugerir con IA": muestra las etapas propuestas como tarjetas que se agregan con un clic
     (o "Agregar todas"); cada una muestra su objetivo.
   - Las etapas de la plantilla quedan como chips de sugerencia, no como contenido.
   - Agregar escribiendo: Enter agrega y deja el campo listo para la siguiente.
   - En escritorio (con mouse) el `⋯` aparece solo al pasar sobre la fila.

## No entra ahora (siguientes partes)

- Guardar el plan con la meta (`goals.ai_plan`, migración 0018) y crear tareas con las primeras
  acciones.
- Escritorio en 3 zonas (pasos · pregunta · tu meta en vivo).
- Informes de avance.

## Pendientes antes de desplegar

- Límite diario persistente (tabla) en vez de memoria.
- Nivel pago de Gemini + proveedor de respaldo (informe de proveedores).
- Variables en Vercel: `GEMINI_API_KEY`, `GEMINI_MODEL`.

## Ampliación 2026-10-31: coach especializado (entrega 1)

Pedido del usuario: memoria por usuario, pulir cada meta con preguntas, IA especializada (no un
prompt genérico), al crear la meta y también después.

Implementado (sin cambios de base de datos):
- **Método fijo** (`src/domain/planningMethod.ts`): instrucción de sistema con 6 reglas (punto de
  partida, resultado observable, progresión gradual, capacidad real, primer paso mínimo,
  obstáculos) + guía por nicho. Prefijo estable → caché implícito del proveedor.
- **Preguntas antes del plan**: 1–3 preguntas con respuestas rápidas; no repite lo ya sabido.
- **Revisión de realismo en código** (`checkPlanRealism`): minutos vs. horario comprometido y
  semanas vs. fecha límite; si falla, una corrección al modelo.
- **Pulir** con frases o atajos ("Más suave", "Solo fines de semana"); devuelve `changeNote`.
- **Memoria de comportamiento** (`userSignals`): cumplimiento de sesiones (60 días), minutos ya
  comprometidos, metas activas, momento preferido. Se lee con el token del usuario (RLS) y se
  muestra a la persona ("Tuvimos en cuenta…").
- Límite: 30 acciones/día por usuario (en memoria, ver Pendientes).

Entrega 2 (requiere migración que corre el usuario): guardar `goals.ai_plan` y respuestas,
perfil de IA visible/editable, y "hablar con la meta" en el detalle (reajuste por pedido; la app
lo sugiere cuando vas atrasado, pero el usuario decide).
