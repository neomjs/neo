import Neo                        from '../../../src/Neo.mjs';
import * as core                  from '../../../src/core/_export.mjs';
import {createPlaneMailboxClient} from '../../services/fleet/planeMailboxClient.mjs';
import {foldDefectObservations}   from '../../services/memory-core/helpers/defectObservationFold.mjs';

/**
 * @summary Prints the standing defect-observation ledger — the fold over `defect-note:` A2A
 * broadcasts (ticket-create's zero-ceremony capture channel).
 *
 * Read-only by construction: the mailbox is the canonical store, the fold is the projection,
 * and this script is one consumer. Nothing here writes, prunes, or mutates — aging is computed
 * at read time.
 *
 * The fleet's mailbox lives on the PLANE, so the plane read is the default; `--local` folds the
 * in-process store of this checkout instead (test/isolated planes).
 *
 * Usage:
 *   node ai/scripts/diagnostics/defectObservations.mjs [--limit 500] [--quiet-after-days 7] [--json] [--local]
 *   node ai/scripts/diagnostics/defectObservations.mjs --plane-base http://127.0.0.1:3102   # operator boxes
 *
 * Plane coordinates resolve from `AiConfig.fleet.planeBase`/`planeBearer`; `--plane-base` overrides
 * the URL, and `NEO_FLEET_PLANE_BEARER` is the bearer's leaf-bound env channel (e.g.
 * `NEO_FLEET_PLANE_BEARER=$GH_TOKEN` on an operator box).
 */

const args = process.argv.slice(2);

function readArgValue(name, fallback) {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1];
}

const limit        = Number(readArgValue('--limit', 500)),
      quietAfterMs = Number(readArgValue('--quiet-after-days', 7)) * 24 * 60 * 60 * 1000,
      useLocal     = args.includes('--local');

if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`defectObservations: --limit must be a positive integer, got "${readArgValue('--limit', undefined)}"`);
}

/**
 * Folds the plane mailbox (the fleet's canonical A2A store) via the single-viewer client.
 * @returns {Promise<Array<Object>>}
 */
async function readPlaneObservations() {
    const {default: AiConfig} = await import('../../config.mjs'),
          planeBase           = (readArgValue('--plane-base', null) ?? AiConfig.fleet.planeBase).trim().replace(/\/+$/, '');

    if (!planeBase) {
        throw new Error('defectObservations: no plane is configured (AiConfig.fleet.planeBase) — pass --plane-base or use --local');
    }

    const client = createPlaneMailboxClient({
        baseUrl   : `${planeBase}/mc/mcp`,
        credential: AiConfig.fleet.planeBearer
    });

    try {
        const identity = process.env.NEO_AGENT_IDENTITY || '@system',
              init     = await client.init({expectedIdentity: identity});

        if (!init.ok) {
            throw new Error(`defectObservations: plane init failed — ${init.reason}`);
        }

        const {messages} = await client.listMessages({to: 'AGENT:*', status: 'all', limit});

        return foldDefectObservations(
            messages.filter(message => typeof message.subject === 'string' && message.subject.startsWith('defect-note:')),
            {quietAfterMs}
        );
    } finally {
        await client.close();
    }
}

/**
 * Folds this checkout's own mailbox store (isolated/test planes).
 * @returns {Promise<Array<Object>>}
 */
async function readLocalObservations() {
    const {default: LifecycleService}      = await import('../../services/memory-core/lifecycle/SystemLifecycleService.mjs'),
          {default: GraphService}          = await import('../../services/memory-core/GraphService.mjs'),
          {default: MailboxService}        = await import('../../services/memory-core/MailboxService.mjs'),
          {default: RequestContextService} = await import('../../mcp/server/shared/services/RequestContextService.mjs');

    await LifecycleService.ready();
    await GraphService.ready();

    return RequestContextService.run({agentIdentityNodeId: process.env.NEO_AGENT_IDENTITY || '@system'}, async () => {
        const {messages} = await MailboxService.listMessages({to: 'AGENT:*', status: 'all', limit});

        return foldDefectObservations(
            messages.filter(message => typeof message.subject === 'string' && message.subject.startsWith('defect-note:')),
            {quietAfterMs}
        );
    });
}

const observations = useLocal ? await readLocalObservations() : await readPlaneObservations();

if (args.includes('--json')) {
    console.log(JSON.stringify(observations, null, 2));
    process.exit(0);
}

if (observations.length === 0) {
    console.log(`No defect observations in the last ${limit} broadcast message(s) (${useLocal ? 'local store' : 'plane'}).`);
    process.exit(0);
}

for (const record of observations) {
    console.log(
        `[${record.state}] ${record.surface} — ${record.symptom || '(unparsed note)'}\n` +
        `    ${record.count} note(s) · ${record.reporters.join(', ') || 'unknown'} · ` +
        `last seen ${record.lastSeenAt} · ${record.fingerprint}`
    );
}

process.exit(0);
