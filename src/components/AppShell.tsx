import { Outlet } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'

/** Layout de las pantallas con barra inferior (Hoy, Metas, Agenda, Perfil). */
export function AppShell() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  )
}
