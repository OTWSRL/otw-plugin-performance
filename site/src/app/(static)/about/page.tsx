import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'About' }

export default function About() {
  return (
    <>
      <h1>About</h1>
      <p>A prerendered page: built once, and served as it is to everyone.</p>
      <p>
        <Link href="/about/team">Team</Link>
      </p>
    </>
  )
}
