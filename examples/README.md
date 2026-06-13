# Scope: Body-Only Examples

Top-level `examples/` is reserved for **Body (frontend) examples**. `npm run build-all` recursively
walks this tree and builds every directory containing an `app.mjs` as a Neo app (from its
`neo-config.json`), so a non-Body / vanilla / app-less example placed here breaks the build.

**AI / harness / non-Body examples belong under `ai/examples/`** — which the dev-server's
`process.cwd()` static root still serves, so browser e2e keeps working. The
`check-examples-body-only` CI guard (`buildScripts/util/check-examples-body-only.mjs`) enforces this:
it fails the merge-gate when an `app.mjs` build target under `examples/` lacks `neo-config.json` or
`index.html` (webpack's `createStartingPoint` reads both), or when any example here imports from `ai/`.

# Client Requirements

Running the examples locally works fine in all environments inside all major browsers at this point:
Chrome, Edge, Firefox & Safari


# Local Web-Server Requirements

Why do I need a local web-server?

In short: it is possible to run the framework without a local web-server, but this would be a huge security issue.
You can start Chrome using a flag (--allow-file-access-from-files), but this will allow the browser to access any
file on your hard drive. To avoid this, a local web-server is the way to go.

**Webpack Dev Server**<br>
`npm run server-start`

**All Servers**<br>
Ensure your server has a mime-type configured for Javascript Modules (.mjs) files. This should be set to the same as
normal javascript (.js) files, normally 'application/-javascript'.

**JetBrains IDE**
- Go to Preferences -> Build, Execution, Deployment -> Debugger
- Built-in server -> Allow unsigned requests (true)

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
