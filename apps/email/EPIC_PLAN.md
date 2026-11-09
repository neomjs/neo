# Email demo

This app completes the five outcomes in [#6600](https://github.com/neomjs/neo/issues/6600):
a buffered inbox, a dedicated reader, reader and compose pop-outs, and an animated full-viewport composer.

## Try it

Serve the repository with `npm run server-start` and open `apps/email/index.html`.
The app uses SharedWorkers, so its windows share the same live App Worker.

- Scroll the 250 local demo messages and select a row. The reader shows the selected record.
- Choose **Open in window** above the reader. Selecting another inbox row updates that same reader in its popup.
- Choose **Compose**, type a draft, and use the maximize button to expand it to the browser content viewport.
  Restore returns it to overlay size. Closing/reopening the overlay keeps the live draft.
- The composer's **Open in window** moves its existing fields and draft to a popup.
  Close the native popup window to return that same host to the inbox.

This is a UI demo: no account, sending service, or persistent draft storage is provided.
Return requires the original inbox window to remain open. If it closes first, detached content can remain
live in its own window; closing the final window ends that in-memory draft.

## Ownership

`WorkspaceContainer` uses the engine Dashboard's transfer/return lifecycle and owns the model-backed Store.
`MainView`, `DetailView` and `ComposeView` remain functional components. The reader Panel and
`ComposeDialog` own their providers, so selected message/draft state travels with its host.
Movable hosts are not conditional children of a functional render.

The composer is created on first use and retained afterward. It declares `autoMount: false` and no
animation target, so the Dashboard renders the first insertion instead of the Dialog mounting itself.
Later hidden-to-visible transitions use the same instance, and they are instant: only maximize animates.
`WorkspaceController` guards popup admission before awaiting geometry; reopening a named live popup
would navigate it and destroy the draft. Source-only actions are unavailable while opening or detached.

## Verification and retained experiment

`test/playwright/e2e/realworld/EmailMultiWindowNL.spec.mjs` drives the actual app with native browser input
and popup close. It checks buffering/selection, same-object return, draft bindings, maximize motion,
popup refusal, repeated admission, pending-popup Escape, and editing after source retirement.

Run it with the repository's E2E config and a provisioned Brain runtime for the SharedWorker Neural Link:

```sh
NEO_AGENTOS_RUNTIME_ROOT=/absolute/path/to/neo-agent-brain NEO_NL_PORT=<free-port> \
npx playwright test -c test/playwright/playwright.config.e2e.mjs test/playwright/e2e/realworld/EmailMultiWindowNL.spec.mjs
```

The [intake experiment](https://github.com/neomjs/neo/issues/6600#issuecomment-6681495014)
retains the original question, browser result and limits. A second-open negative control lost the draft
by reloading its named popup; the app guard and regression test are the disposition of that result.
No OS placement or persistence claim follows from the browser proof.
