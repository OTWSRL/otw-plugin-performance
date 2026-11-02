import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Team' }

export default function Team() {
  return (
    <>
      <h1>Team</h1>
      <p>Another prerendered page, for navigations between prerendered pages.</p>
    </>
  )
}
