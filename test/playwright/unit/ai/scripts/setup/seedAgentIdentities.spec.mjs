import {setup} from '../../../../setup.mjs'

const appName = 'SeedAgentIdentitiesTest'

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
})

import {test, expect} from '@playwright/test'
import Neo            from '../../../../../../src/Neo.mjs'
import * as core      from '../../../../../../src/core/_export.mjs'

import {seedAgentIdentities} from '../../../../../../ai/scripts/setup/seedAgentIdentities.mjs'
import {IDENTITIES}          from '../../../../../../ai/graph/identityRoots.mjs'

/**
 * Minimal GraphService double exposing exactly the three surfaces the script touches: `ready()`,
 * `getNode()`, and `upsertNode()`, plus the raw-SQLite peek path (`db.storage.db.prepare().get()`)
 * the reconciler reads to learn what is durably stored.
 *
 * The peek is modelled as a real prepared-statement shape rather than stubbed away, because the
 * script's authority decision depends on comparing the STORED stamp against the registry's — a
 * double that answered from the projection instead would pass while the production path compared
 * the wrong two values.
 *
 * @param {Object} storedById Map of node id to its persisted `properties` bag.
 * @returns {Object} The double, with `upserts` recording every projected identity.
 */
function graphServiceDouble(storedById = {}) {
    const upserts = [];

    return {
        upserts,
        ready     : async () => {},
        getNode   : ({id}) => storedById[id] ? {id, properties: storedById[id]} : null,
        upsertNode: identity => { upserts.push(identity) },
        db        : {
            storage: {
                db: {
                    prepare: () => ({
                        get: id => storedById[id]
                            ? {data: JSON.stringify({properties: storedById[id]})}
                            : undefined
                    })
                }
            }
        }
    }
}

const registryEntry = ({id = '@probe', createdAt = '2026-01-01T00:00:00.000Z', ...rest} = {}) => ({
    id,
    type      : 'AgentIdentity',
    name      : 'Probe',
    properties: {accountType: 'agent', displayName: 'Probe', ...(createdAt ? {createdAt} : {}), ...rest}
});

const upsertedProps = (svc, id) => svc.upserts.find(entry => entry.id === id)?.properties;

test.describe('seedAgentIdentities — createdAt authority (#15868)', () => {
    test('the REGISTRY wins: a divergent stored stamp is reconciled, not retained', async () => {
        // The defect in one assertion: projecting the STORED value here is what made a wrong
        // identity age permanently unfixable, since no other writer touches the field.
        const svc = graphServiceDouble({'@probe': {createdAt: '2026-06-23T06:39:18.915Z'}});

        await seedAgentIdentities({
            graphService: svc,
            identities  : [registryEntry({createdAt: '2026-06-02T21:35:48.405Z'})],
            log         : () => {}
        });

        expect(upsertedProps(svc, '@probe').createdAt).toBe('2026-06-02T21:35:48.405Z')
    });

    test('a silent registry never blanks a persisted stamp', async () => {
        // The original guard's legitimate case, preserved: with nothing declared, the node's own
        // stamp is carried forward rather than dropped.
        const svc = graphServiceDouble({'@probe': {createdAt: '2026-06-23T06:39:18.915Z'}});

        await seedAgentIdentities({
            graphService: svc,
            identities  : [registryEntry({createdAt: null})],
            log         : () => {}
        });

        expect(upsertedProps(svc, '@probe').createdAt).toBe('2026-06-23T06:39:18.915Z')
    });

    test('an absent node is created with the registry value verbatim', async () => {
        const svc = graphServiceDouble();

        await seedAgentIdentities({
            graphService: svc,
            identities  : [registryEntry({createdAt: '2026-06-02T21:35:48.405Z'})],
            log         : () => {}
        });

        expect(upsertedProps(svc, '@probe').createdAt).toBe('2026-06-02T21:35:48.405Z')
    });

    test('an already-matching stamp is idempotent', async () => {
        const svc = graphServiceDouble({'@probe': {createdAt: '2026-06-02T21:35:48.405Z'}});

        await seedAgentIdentities({
            graphService: svc,
            identities  : [registryEntry({createdAt: '2026-06-02T21:35:48.405Z'})],
            log         : () => {}
        });

        expect(upsertedProps(svc, '@probe').createdAt).toBe('2026-06-02T21:35:48.405Z')
    });

    test('displayName is projected over a stale pre-Social-Name label', async () => {
        // Residents named after their node was created still serve handle-derived labels until
        // this script runs. Pinned so the naming outcome cannot silently stop projecting.
        const svc = graphServiceDouble({'@probe': {createdAt: '2026-06-02T21:35:48.405Z', displayName: 'Neo Probe'}});

        await seedAgentIdentities({
            graphService: svc,
            identities  : [registryEntry({displayName: 'Probe'})],
            log         : () => {}
        });

        expect(upsertedProps(svc, '@probe').displayName).toBe('Probe')
    });

    test('the registry declares createdAt for every resident — the contract the script now enforces', () => {
        // Header↔reconciler agreement: identityRoots.mjs calls createdAt immutable and hardcoded.
        // If a future entry omits it, the fallback silently governs that row and the immutability
        // claim quietly stops applying to it. Fail loudly instead.
        const missing = IDENTITIES.filter(identity => !identity.properties?.createdAt).map(identity => identity.id);

        expect(missing).toEqual([])
    })
});
