# Cadena de respaldo de la IA del coach

Fecha: 2026-11-05. Estado: aprobado para implementar (fase 1 y 2).

## Contexto

Alrededor del 85 % de las llamadas a Gemini devolvían 503. Todo el coach sale por
un solo punto (`call()` en `src/server/geminiPlanner.ts`) con un modelo y una
clave, y un 503 no se reintentaba: subía directo al usuario como `ai_unavailable`
y además gastaba su cuota diaria.

## Decisión

Una **cadena ordenada de eslabones** `proveedor:modelo` que se recorre por cada
llamada al modelo. El usuario solo ve un error si cae la cadena entera.

- **Configuración:** `AI_CHAIN` (lista separada por comas, p. ej.
  `gemini:gemini-3.6-flash,groq:openai/gpt-oss-120b`). Sin `AI_CHAIN` se usa una
  cadena por defecto (ver `src/server/aiChain.ts`); `GEMINI_MODEL` sigue valiendo y
  va primero. Se descartan los eslabones cuyo proveedor no tiene clave.
- **Claves:** `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`. `GEMINI_API_KEY`
  acepta varias claves separadas por comas: la cuota de Gemini es por proyecto, así
  que solo suman claves de proyectos distintos.
- **Dos adaptadores:** Gemini nativo (`responseSchema`, razonamiento bajo) y uno
  compatible con OpenAI (`/chat/completions` con `response_format: json_schema`,
  `strict: false`) para Groq y OpenRouter. El esquema de Gemini (tipos en
  mayúsculas) se convierte a JSON Schema.
- **Cuándo se salta al siguiente:** 429, 5xx, timeout, error de red, respuesta
  cortada (`finishReason` distinto de fin normal) o JSON que no pasa el parseo del
  dominio. 400/401/403/404 también saltan, registrados como error de configuración.
- **Enfriamiento:** un eslabón que dio 429/5xx/timeout se salta 60 s en esa
  instancia (memoria del módulo). Si todos están enfriados se prueban igual.
- **Presupuesto:** cada intento tiene como tope 20 s y el tiempo que quede de un
  presupuesto de 45 s por llamada (15 s para la corrección opcional del plan). Sin
  esperas entre eslabones (los 503 responden rápido). Si la pasada completa falla,
  un último intento con el primer eslabón tras 1 s ± 25 %, salvo que todos los
  fallos fueran de configuración.
- **Cuota:** se devuelve la unidad si la petición termina en `ai_unavailable`.
- **Reparación del plan:** si la llamada de corrección falla, se conserva el primer
  plan.
- **Registro:** una línea por intento fallido (`[ai] proveedor:modelo motivo ms`) y
  el eslabón que respondió. Sin prompts ni datos de la persona.

## Medición

`npm run probe:ai -- N` prueba cada eslabón por separado N veces con un pedido
mínimo y muestra aciertos al primer intento, con reintento y latencia. Primera
medición (2026-11-05, 8 intentos, sin 503 en ese momento): `gemini-3.5-flash-lite`
8/8 (~0,8 s), `gemini-3.1-flash-lite` 8/8 (~1 s), `gemini-3.6-flash` 2/8 por 429
(cuota gratuita muy baja): por eso va detrás en la cadena por defecto.

## Alternativas descartadas

- OpenRouter como único enrutador: un solo punto de fallo y 50 peticiones diarias
  gratis.
- Vercel AI SDK / AI Gateway, LiteLLM, Portkey: dependencia o servicio extra para
  algo que son ~150 líneas con `fetch`.
- Circuit breaker compartido (KV/Redis): sobra mientras no haya tráfico real.

## Producción

El diseño no cambia: Gemini de pago primero y un proveedor de pago de otra empresa
detrás, solo cambiando `AI_CHAIN` y claves. El nivel gratuito de Gemini usa los
datos para entrenar: en pruebas, solo datos ficticios.
