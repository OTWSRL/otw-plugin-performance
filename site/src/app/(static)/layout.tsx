import { PrerenderedPerformanceBar } from '@otwdesign/plugin-performance/prerendered'
import type { ReactNode } from 'react'
import '../globals.css'

// A prerendered layout, like a documentation site's: it reads no database and knows no user, so
// it can't render slots. The performance bar comes as a component instead.
export default function StaticLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="site-main">{children}</main>
        <PrerenderedPerformanceBar />
      </body>
    </html>
  )
}
