import CockpitDockDocument from '../util/CockpitDockDocument.mjs';

/**
 * @summary The mission-control walkthrough: "watch a real AI engineering team run" — the
 * cockpit's public story as `neo.tour.script.v1` data, played on the LIVE Fleet Cockpit over
 * its real roster.
 *
 * Five beats, one continuous minute (the story no competitor can film):
 *
 * 1. **The fleet, live** — the density-ranked agent roster over the activity stream: real
 *    maintainers, one running app-worker.
 * 2. **The stream speaks** — a CONTROLLED demonstration burst (tour provenance, explicitly
 *    bounded, restored at the take terminal) drives the stream's own reactive seam — the demo
 *    shows the mechanism, never poses generated data as Memory Core arrival.
 * 3. **Drill** — one resident's detail opens through the production selection seam (the
 *    `drill` cue is NAME-addressed against the public roster, so every run drills the same
 *    agent deterministically).
 * 4. **The pane leaves the window** — the detail becomes a real OS window on the shared heap
 *    and comes home (the shipped vessel state machine; reparent, never recreate).
 * 5. **The close** — the line the whole surface earns: the team on screen built the app the
 *    viewer is watching.
 *
 * The fleet-start cascade is deliberately NOT a scripted beat in v1: its live effects need
 *  the real fleet bridge, so the recorded demo narrates it over the health bar instead (the
 * scoping is recorded on the owning ticket).
 *
 * Layering contract (the established tour law): this screenplay is nearly pure narration —
 * every transition rides a cue the hosting cockpit consumes with an observable receipt; no
 * step asserts host-owned effects, so pure spec-mode replay stays deterministic and the
 * worker-truth assertions live in the walkthrough's e2e leg (the trinity: one script = the
 * demo, the e2e, the recording).
 *
 * Cue vocabulary consumed by the hosting cockpit: `activity-burst` (inject an explicitly
 * bounded `count` of TOUR-provenance demo events through the stream's reactive seam; the
 * displaced owner-held state restores at the take terminal) · `drill` (select the resident
 * whose record `agentId` matches `name`, through the production selection seam) · `popout`,
 * `reattach` (the detail vessel's own state machine).
 */

/**
 * The opening stage — the Fleet Cockpit's REAL default document, imported from the cockpit's
 * own data leaf so the walkthrough can never drift from the shipped surface.
 * @type {Object}
 */
export const initialDocument = Object.freeze(CockpitDockDocument.create());

/**
 * The walkthrough script. Every transition is a cue on a pacing step; document truth stays
 * untouched by the script itself (the projection follows the cues' host effects).
 * @type {Object}
 */
export const missionControlTourScript = Object.freeze({
    schema: 'neo.tour.script.v1',
    id    : 'mission-control-walkthrough',
    title : 'Mission control: watch a real AI engineering team run',

    workspace: {},

    scenes: [{
        id     : 's1',
        title  : 'The fleet, live',
        caption: 'This is mission control for an AI engineering team. Every card is a real maintainer; the stream below carries fleet activity. One running app-worker owns everything on this stage.',
        steps  : [
            {type: 'pause', ms: 2600, caption: 'the roster ranks itself by activity — the fleet you see is the fleet this workspace watches'}
        ]
    }, {
        id     : 's2',
        title  : 'The stream speaks',
        caption: 'Fleet events arrive through one reactive seam — no refresh, no polling, the worker pushes truth. Watch the stream take a CONTROLLED demonstration burst through that exact seam.',
        steps  : [
            {type: 'pause', ms: 900, cue: {type: 'activity-burst', count: 40}, caption: 'forty demo events land the same way real ones do: the window keeps the newest, folds the rest, and names the fold honestly'},
            {type: 'pause', ms: 2200}
        ]
    }, {
        id     : 's3',
        title  : 'Drill',
        caption: 'One click opens any agent\'s detail — identity, thought stream, current lane, repository state — through the same selection path an operator drives.',
        steps  : [
            {type: 'pause', ms: 900, cue: {type: 'drill', name: 'neo-fable'}, caption: 'drill(neo-fable): the inspector reveals from the rail and renders THAT resident — four panes, each with its own freshness truth'},
            {type: 'pause', ms: 2400}
        ]
    }, {
        id     : 's4',
        title  : 'The pane leaves the window',
        caption: 'The detail detaches to its OWN OS window — same component instance, same live subscriptions, one shared-memory heap across both windows.',
        steps  : [
            {type: 'pause', ms: 900, cue: {type: 'popout', itemId: 'detail'}, caption: 'pop out: a real second window opens and the SAME instance renders there — reparent, never recreate'},
            {type: 'pause', ms: 2600, caption: 'the stream keeps ticking, the detail keeps updating — none of the docking libraries surveyed in the decision record offered live cross-window state like this'},
            {type: 'pause', ms: 900, cue: {type: 'reattach', itemId: 'detail'}, caption: 'and home again — same instance, zero re-mount'},
            {type: 'pause', ms: 1400}
        ]
    }, {
        id     : 's5',
        title  : 'The close',
        caption: 'The Start fleet action, the perspectives, the tear-out gestures — all of it runs from this surface. One line matters more than any feature:',
        steps  : [
            {type: 'pause', ms: 2600, caption: '…and this team built the app you are watching.'},
            {type: 'pause', ms: 1200}
        ]
    }]
});

export default missionControlTourScript;
