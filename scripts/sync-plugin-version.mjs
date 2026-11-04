// Runs after `changeset version`: the plugin's `version` in src/index.tsx, which the Plugins screen
// shows, follows package.json. test/version.test.ts fails if the two ever differ.
import { readFileSync, writeFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const file = new URL('../src/index.tsx', import.meta.url)
const source = readFileSync(file, 'utf8')
// The definition's own `version:`, indented one level inside definePlugin({ … }).
const line = /^ {2}version: '[^']*',$/m
if (!line.test(source)) throw new Error(`${file.pathname} has no plugin version line to update`)
writeFileSync(file, source.replace(line, `  version: '${version}',`))
console.log(`The plugin's version is ${version}`)
