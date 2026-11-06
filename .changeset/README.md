# Changesets

Each change that should reach npm comes with a changeset: `pnpm changeset`, pick the bump, and
describe the change for the changelog. Commit the file with the change.

- A patch fixes, a minor adds, a major breaks something a site or another plugin relies on.
- A release that needs a newer OTW CMS raises the peer ranges on `@otwdesign/sdk` and
  `@otwdesign/admin-ui` and `requires.core` in `src/index.tsx` together, in the same change.

To release, run `pnpm version-packages`, which writes the version bump (in `package.json` and the
plugin's `version` in `src/index.tsx`) and the changelog, then commit and push to `main`. Once CI
passes, the release workflow publishes to npm.
