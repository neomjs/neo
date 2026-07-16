# Running the Fleet Cockpit

The Fleet Manager cockpit is the operator's mission-control surface: the live agent roster, the
activity stream, per-agent drill-in, and the lifecycle controls (start / stop / restart, the
one-click morning start). A LIVE session needs two processes — the webpack dev server that serves
the app, and the fleet HTTP transport the cockpit's controls and live feeds ride on.

## The one command

```bash
npm run cockpit
```

That is the whole boot. The launcher (`buildScripts/devCockpit.mjs`) supervises both processes and
opens the browser directly on the cockpit surface (`apps/agentos/index.html`). On a fresh checkout
this lands you on a live roster with working controls — no second terminal, no manual server start.

What it does, in order:

1. **Probes the fleet endpoint** (`127.0.0.1:8083`) for *protocol identity* — not just "is the port
   busy". A confirmed fleet transport (another checkout or a prior run) is **reused** with a named
   log line; a foreign occupant (something else holding the port) makes the launcher **refuse with
   a named reason** rather than compose a silently-broken session.
2. **Starts the fleet transport** (`ai/services/fleet/devFleetServer.mjs`) when the endpoint is
   free.
3. **Starts the dev server** and opens the cockpit page.
4. **Supervises both**: one `Ctrl-C` tears the whole session down; if the fleet transport dies
   mid-session, the launcher logs the loss loudly and the cockpit degrades to its honest offline
   states (clearly-labelled sample data) instead of pretending to be live.

## Without the fleet transport

The cockpit itself always boots — `npm run server-start` alone still serves it. Without the
transport it shows the honestly-labelled sample roster and the controls stay inert: fail-closed,
never fake-live. Start the transport later with `npm run ai:fleet-server` and the next poll goes
live.

## Ports

The composed command runs on the default fleet endpoint (`:8083`) — the browser side of the bridge
pins it. Setting a non-default `NEO_FLEET_PORT` makes the launcher refuse with a named reason
rather than boot a server the cockpit can never reach (the standalone `npm run ai:fleet-server`
keeps honoring the variable for advanced setups).
