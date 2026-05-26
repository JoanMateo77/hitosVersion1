# Hito ✅

App de gestión de metas **con guía**: definí lo que querés lograr y Hito te arma
un plan corto cada día. La app **guía, no exige** — no necesitás saber cómo
descomponer una meta, te lleva paso a paso.

PWA mobile-first, en español. Pensada para gente que sabe _qué_ quiere pero
pierde la ejecución diaria. La visión completa del producto está en
[`idea-app-metas-2.docx`](./idea-app-metas-2.docx).

> Proyecto personal y pieza de portfolio full-stack. Modelo: gratis, sin paywall
> en lo esencial.

## Qué hace

**Núcleo — Wizard + Plantillas + Plan diario (E · F · G)**

- **Onboarding guiado** — ¿una meta o varias? + identificación del nicho
  principal (con mini-entrevista determinística si no lo tenés claro).
- **Wizard de meta** — 5 preguntas (_qué_, _por qué_, _para cuándo_, _área_,
  _criterio de éxito_). Detecta la plantilla sola desde el título.
- **Plantillas por tipo de meta** — cada meta hereda hitos, un pool de acciones
  concretas y una cadencia. Vos ajustás, no inventás la estructura.
- **Plan del día automático** — una acción por meta que "toca" hoy, más lo que
  vos sumes. Botón **"no sé qué hacer, proponé vos"** para días flojos. Vos
  mandás: editar, posponer o quitar cualquier ítem.

**El camino (hitos)** — cada meta muestra su roadmap y **avanza de verdad**:
marcás etapas y ves el progreso ("Etapa 2 de 4") en la lista de metas.

**Recomendación inteligente** (determinística, sin IA en runtime)

- **Ideas para empezar** — si no sabés qué ponerte, sugiere 2-3 metas concretas
  según tu foco, listas para adoptar con un toque.
- **Foco de la semana**, **alertas de metas olvidadas** y **próximo paso** al
  cumplir una meta.

**Agenda / calendario propio** — vistas **día / semana / mes**, eventos con
horario, **vínculo opcional a una meta** y reportes de tiempo ("esta semana le
dedicaste 3 h a tu meta de salud"). La agenda del día también aparece en _Hoy_.

**Modo de foco funcional** — _enfocado_ (una meta por vez) vs _multi-meta_
(reparte entre todas). Editable desde el perfil.

**Revisión guiada** — repasás tus metas activas una por una (seguir / avanzar de
etapa / pausar), según la frecuencia de revisión de cada plantilla.

## Stack

- **Frontend:** React 19 + TypeScript (estricto) + Vite 6 + React Router 7
- **PWA:** `vite-plugin-pwa` (instalable, app-shell offline)
- **Backend:** Supabase (Postgres + Auth) con Row Level Security
- **Cero dependencias de UI:** sistema de diseño propio (tokens CSS) e íconos SVG inline

## Arquitectura

```
src/
├─ lib/          Tipos de dominio · cliente Supabase · utilidades de fecha
├─ domain/       Lógica pura y testeable (sin I/O):
│                  niches · templates (F) · dailyPlan (G) · recommendations · calendar
├─ services/     Acceso a datos tipado: auth · profile · goals · tasks · events
├─ app/          Sesión (contexto) y estado de autenticación
├─ hooks/        useAsyncData
├─ components/   UI reutilizable: BottomNav · Roadmap · TaskItem · OptionRow · íconos…
├─ screens/      Auth · Onboarding · Wizard · GoalCreated · GoalSuggestions ·
│                Today · Goals · GoalDetail · Calendar · Review · Profile
└─ styles/       tokens · base · components

supabase/
├─ schema.sql      Esquema completo + RLS (idempotente; corré todo de una vez)
└─ migrations/     Cambios incrementales (agenda, revisión)
```

**Regla clave:** la lógica de negocio vive en `domain/` como **funciones puras**,
separada de la UI y de la base de datos. Determinística por diseño — la
recomendación no usa un modelo de IA en runtime, para mantener el costo bajo y el
modelo gratis viable.

## Puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Base de datos (Supabase) — _tu paso_

1. Creá un proyecto gratis en [supabase.com](https://supabase.com).
2. En **SQL Editor → New query**, pegá y ejecutá todo
   [`supabase/schema.sql`](./supabase/schema.sql) (ya incluye perfiles, metas,
   tareas, agenda y progreso de hitos).
3. En **Authentication → Sign In/Providers → Email**, desactivá _"Confirm email"_
   (para el MVP, así el registro entra directo).
4. En **Project Settings → API**, copiá la **Project URL** y la
   **anon / publishable key**.

### 3. Claves

```bash
cp .env.example .env   # completá con tus valores
```

> La `anon key` es **pública por diseño** (va en el frontend); la seguridad real
> la dan las políticas RLS del `schema.sql`, no ocultar la clave.

### 4. Correr

```bash
npm run dev   # también sirve en la LAN: http://192.168.x.x:5173
```

## Usarla desde el celular 📱

1. Compu y celular en la **misma red Wi-Fi**.
2. Abrí en el celu la URL **Network** que imprime `npm run dev`.
3. **Compartir → Agregar a pantalla de inicio** → se abre como app a pantalla
   completa, con su ícono.

## Scripts

| Comando             | Qué hace                                 |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Servidor de desarrollo (con acceso LAN)  |
| `npm run build`     | Typecheck estricto + build de producción |
| `npm run preview`   | Sirve el build de producción             |
| `npm run typecheck` | Solo chequeo de tipos                    |

## Roadmap (fuera de alcance por ahora)

- **Sincronización con Google Calendar** — el calendario propio ya está; el sync
  bidireccional queda para una próxima iteración.
- **Push real / recordatorios** — necesita un backend que agende notificaciones;
  hoy hay recordatorios _in-app_ (la agenda del día en _Hoy_).
- **Mensajes contextuales** e **histórico de reflexiones** — en la visión, a
  definir más adelante.
- **Tests automatizados** de `domain/` — las funciones ya son puras y están
  listas para testear.

## Licencia

A definir (sugerencia: MIT). Hecho por Joan Mateo Cardona.
