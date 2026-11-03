import { definePlugin } from '@otwdesign/sdk'

const ITEMS = [1, 2, 3]

// The e2e site's slow page: it fetches its items one query at a time, the N+1 the performance
// bar should point out. Plain SQL, not drizzle's sql``: the CMS's packages are linked from a
// checkout, with a drizzle of their own.
export default definePlugin({
  id: 'catalog',
  version: '1.0.0',
  name: 'Catalog',
  description: 'A slow page for testing the performance bar.',
  requires: { core: '^1.0.0' },
  setup(cms) {
    cms.routes.page({
      name: 'list',
      path: '/catalog',
      load: async () => {
        const items: string[] = []
        for (const id of ITEMS) {
          await cms.db.execute('SELECT 1 AS id')
          items.push(`Item ${id}`)
        }
        return { items }
      },
      metadata: () => ({ title: 'Catalog' }),
      component: ({ data }) => (
        <>
          <h1>Catalog</h1>
          <ul>
            {data.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ),
    })
  },
})
