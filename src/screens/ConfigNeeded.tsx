import { IconHito } from '@/components/icons'

/** Se muestra cuando faltan las claves de Supabase en el .env. */
export function ConfigNeeded() {
  return (
    <div className="screen screen--full">
      <div className="brand">
        <span className="brand__mark">
          <IconHito />
        </span>
        Lógralo
      </div>

      <div className="card stack stack--lg" style={{ marginTop: 'var(--s6)' }}>
        <div>
          <h2>Falta conectar la base de datos</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Lógralo guarda tus metas en Supabase. Configurarlo toma 2 minutos.
          </p>
        </div>

        <ol className="stack stack--sm" style={{ paddingLeft: '1.1em' }}>
          <li>
            Crea un proyecto gratis en <strong>supabase.com</strong>.
          </li>
          <li>
            En <strong>SQL Editor</strong>, pega y ejecuta el archivo{' '}
            <code>supabase/schema.sql</code>.
          </li>
          <li>
            En <strong>Settings → API</strong>, copia la URL y la anon key.
          </li>
          <li>
            Copia <code>.env.example</code> como <code>.env</code> y completa los valores.
          </li>
        </ol>

        <pre
          className="small"
          style={{
            background: 'var(--bg-elev)',
            padding: 'var(--s3)',
            borderRadius: 'var(--radius-sm)',
            overflowX: 'auto',
            border: '1px solid var(--border-soft)',
          }}
        >
          {`VITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...`}
        </pre>

        <p className="faint tiny">
          Después reinicia <code>npm run dev</code> y recarga esta pantalla.
        </p>
      </div>
    </div>
  )
}
