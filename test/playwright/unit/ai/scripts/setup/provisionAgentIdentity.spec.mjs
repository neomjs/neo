import {setup} from '../../../../setup.mjs';

const appName = 'ProvisionAgentIdentityTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import * as schema    from '../../../../../../ai/graph/identitySchema.mjs';
import {
    R3B_FOLLOW_UP_CHECKLIST,
    SOCIAL_NAME_CLASS_KEYS,
    WAKE_SUBSCRIPTION_DEFAULTS,
    buildProvisionPlan,
    decideProvision,
    deriveDisplayForm,
    executeProvision,
    parseProvisionArgs,
    planWrites,
    readExistingState,
    renderWritePlan
} from '../../../../../../ai/scripts/setup/provisionAgentIdentity.mjs';

const FIXED_NOW    = '2026-07-10T12:00:00.000Z';
const BASE_OPTIONS = Object.freeze({
    instanceId: '@neo-test-agent',
    family    : 'claude',
    model     : 'claude-test-1',
    now       : FIXED_NOW
});

/**
 * @summary Builds a valid plan from the shared fixture options.
 * @param {Object} [overrides] Option overrides.
 * @returns {Object} The frozen plan.
 */
function buildPlan(overrides = {}) {
    const built = buildProvisionPlan({...BASE_OPTIONS, ...overrides});

    expect(built.valid).toBe(true);

    return built.plan;
}

/**
 * @summary Simulates the graph rows a prior successful `--commit` of the SAME plan persisted.
 * @param {Object} plan A valid plan.
 * @returns {Object} An `existing` shape for decideProvision.
 */
function existingFromPlan(plan) {
    const asRow = spec => ({id: spec.id, label: spec.type, properties: spec.properties});

    return {
        identityRow     : asRow(plan.writeSpecs.identity),
        identityStateRow: asRow(plan.writeSpecs.identityState),
        episodeRows     : [asRow(plan.writeSpecs.episode)],
        wakeRows        : [asRow(plan.writeSpecs.wakeSubscription)]
    };
}

test.describe('provisionAgentIdentity — Day-0 plan construction (pure half)', () => {

    test('builds the era anchor keyed by INSTANCE ID with since = provisioning time, and the chain validates', () => {
        const plan = buildPlan();

        // era chain key = instance id (the Tier-2 decision) — anchor and era both carry it
        expect(plan.schema.identityState.identityKey).toBe('@neo-test-agent');
        expect(plan.schema.identityState.id).toBe('identity-state-@neo-test-agent');
        expect(plan.schema.episode.identityKey).toBe('@neo-test-agent');

        // no backfill: since = the actual provisioning timestamp, open era (until: null)
        expect(plan.schema.episode.since).toBe(FIXED_NOW);
        expect(plan.schema.episode.until).toBeNull();
        expect(plan.schema.episode.model).toBe('claude-test-1');
        expect(plan.schema.episode.family).toBe('claude');

        // the gate the write path relies on: the chain re-validates through the schema itself
        expect(schema.validateEraChain(plan.schema.identityState, [plan.schema.episode])).toEqual({valid: true, reason: null});

        // Layer-1 operational defaults: handle-derived display form, github/mailbox default to the instance id
        expect(plan.displayForm).toBe('Neo Test Agent');
        expect(deriveDisplayForm('@neo-fable-clio')).toBe('Neo Fable Clio');
        expect(plan.githubUsername).toBe('@neo-test-agent');
        expect(plan.mailbox).toBe('@neo-test-agent');
        expect(plan.writeSpecs.identity.properties.identityContract.requiredA2aMailboxAddress).toBe('@neo-test-agent');
        expect(plan.writeSpecs.identity.properties.accountType).toBe('agent');

        // the Day-0 wake route: metadata-free channel, owned by the instance id
        expect(plan.writeSpecs.wakeSubscription.properties.harnessTarget).toBe(WAKE_SUBSCRIPTION_DEFAULTS.harnessTarget);
        expect(plan.writeSpecs.wakeSubscription.properties.agentIdentity).toBe('@neo-test-agent');
        expect(plan.writeSpecs.wakeEdge).toEqual({
            source      : '@neo-test-agent',
            target      : plan.writeSpecs.wakeSubscription.id,
            relationship: 'SUBSCRIBES_TO',
            weight      : 1.0
        });
    });

    test('the input surface is Layer-1 ONLY: every socialName-class key is rejected, the social layer ships empty', () => {
        for (const key of SOCIAL_NAME_CLASS_KEYS) {
            const built = buildProvisionPlan({...BASE_OPTIONS, [key]: 'Muse'});

            expect(built.valid).toBe(false);
            expect(built.plan).toBeNull();
            expect(built.reason).toContain('naming ritual');
        }

        // and on a valid plan, the social layer is empty BY CONSTRUCTION — there is no input path into it
        const plan = buildPlan();

        expect(plan.writeSpecs.identityState.properties.socialLayer).toEqual({});
        expect(plan.schema.identityState.socialLayer).toEqual({});

        // displayName stays operational: it feeds the display form, never a Social Name slot
        const named = buildPlan({displayName: 'Neo Test Agent II'});
        expect(named.writeSpecs.identity.properties.displayName).toBe('Neo Test Agent II');
        expect(named.writeSpecs.identityState.properties.socialLayer).toEqual({});
    });

    test('CLI flag surface mirrors the guard: socialName-class flags and unknown flags refuse loudly', () => {
        const social = parseProvisionArgs(['--instance-id', '@neo-x', '--family', 'claude', '--model', 'm', '--social-name', 'Muse']);
        expect(social.valid).toBe(false);
        expect(social.reason).toContain('naming ritual');

        const nameFlag = parseProvisionArgs(['--name', 'Muse']);
        expect(nameFlag.valid).toBe(false);

        const unknown = parseProvisionArgs(['--frobnicate', 'x']);
        expect(unknown.valid).toBe(false);
        expect(unknown.reason).toContain('unknown option');

        const dangling = parseProvisionArgs(['--instance-id']);
        expect(dangling.valid).toBe(false);
        expect(dangling.reason).toContain('requires a value');

        const parsed = parseProvisionArgs(['--instance-id', '@neo-x', '--family', 'claude', '--model', 'm', '--commit']);
        expect(parsed.valid).toBe(true);
        expect(parsed.options).toEqual({
            commit    : true,
            help      : false,
            instanceId: '@neo-x',
            family    : 'claude',
            model     : 'm'
        });
    });

    test('fail-closed inputs: missing/malformed fields and unparseable timestamps build NOTHING', () => {
        for (const bad of [
            {...BASE_OPTIONS, instanceId: undefined},
            {...BASE_OPTIONS, instanceId: '  '},
            {...BASE_OPTIONS, instanceId: '@Bad Handle!'},
            {...BASE_OPTIONS, family: undefined},
            {...BASE_OPTIONS, family: 'Claude'},
            {...BASE_OPTIONS, model: ''},
            {...BASE_OPTIONS, now: 'not-a-date'},
            {...BASE_OPTIONS, displayName: '   '}
        ]) {
            const built = buildProvisionPlan(bad);

            expect(built.valid).toBe(false);
            expect(built.plan).toBeNull();
            expect(typeof built.reason).toBe('string');
        }
    });
});

test.describe('provisionAgentIdentity — idempotence decision + dry-run/commit exactness', () => {

    test('fresh graph: every surface creates, and the commit write set IS the dry-run write plan', () => {
        const plan     = buildPlan();
        const decision = decideProvision({plan, existing: {}});

        expect(decision.valid).toBe(true);
        expect(decision.alreadyProvisioned).toBe(false);
        expect(decision.surfaces).toEqual({identity: 'create', identityState: 'create', era: 'create', wake: 'create'});

        // exactness: what --commit writes deep-equals the single write source dry-run renders from
        expect(decision.writes).toEqual(planWrites(plan));

        // and the rendered dry-run names every write of that set
        const rendered = renderWritePlan(plan).join('\n');

        for (const write of planWrites(plan)) {
            if (write.op === 'linkNodes') {
                expect(rendered).toContain(`${write.edge.source} -[${write.edge.relationship}]-> ${write.edge.target}`);
            } else {
                expect(rendered).toContain(`${write.op} ${write.spec.id}`);
            }
        }
    });

    test('already provisioned: all surfaces exist, zero writes, alreadyProvisioned flagged', () => {
        const plan     = buildPlan();
        const decision = decideProvision({plan, existing: existingFromPlan(plan)});

        expect(decision.valid).toBe(true);
        expect(decision.alreadyProvisioned).toBe(true);
        expect(decision.surfaces).toEqual({identity: 'exists', identityState: 'exists', era: 'exists', wake: 'exists'});
        expect(decision.writes).toEqual([]);
        expect(decision.divergences).toEqual([]);
    });

    test('divergent open era: loud diff, NOTHING written — a model change is era migration, not re-provisioning', () => {
        const plan     = buildPlan();
        const existing = existingFromPlan(plan);

        existing.episodeRows = [{
            ...existing.episodeRows[0],
            properties: {...existing.episodeRows[0].properties, model: 'claude-other-2'}
        }];

        const decision = decideProvision({plan, existing});

        expect(decision.valid).toBe(false);
        expect(decision.writes).toEqual([]);
        expect(decision.divergences).toEqual([
            expect.objectContaining({surface: 'era', field: 'model', existing: 'claude-other-2', planned: 'claude-test-1'})
        ]);
        expect(decision.divergences[0].note).toContain('era MIGRATION');
    });

    test('divergent identity facts (githubLogin / modelFamily) refuse with a structured diff', () => {
        const plan     = buildPlan();
        const existing = existingFromPlan(plan);

        existing.identityRow = {
            ...existing.identityRow,
            properties: {...existing.identityRow.properties, githubLogin: '@someone-else', modelFamily: 'gpt'}
        };

        const decision = decideProvision({plan, existing});

        expect(decision.valid).toBe(false);
        expect(decision.writes).toEqual([]);
        expect(decision.divergences.map(entry => entry.field).sort()).toEqual(['githubLogin', 'modelFamily']);
    });

    test('crash recovery: only the MISSING surfaces create (wake-only completion)', () => {
        const plan     = buildPlan();
        const existing = existingFromPlan(plan);

        existing.wakeRows = [];

        const decision = decideProvision({plan, existing});

        expect(decision.valid).toBe(true);
        expect(decision.alreadyProvisioned).toBe(false);
        expect(decision.surfaces).toEqual({identity: 'exists', identityState: 'exists', era: 'exists', wake: 'create'});
        expect(decision.writes.map(write => write.op)).toEqual(['upsertNode', 'linkNodes']);
    });

    test('a richer self-registered wake route counts as provisioned — Day-0 never duplicates wake fanout', () => {
        const plan     = buildPlan();
        const existing = existingFromPlan(plan);

        existing.wakeRows = [{
            id        : 'WAKE_SUB:runtime-uuid',
            label     : 'WAKE_SUBSCRIPTION',
            properties: {agentIdentity: plan.instanceId, trigger: 'SENT_TO_ME', harnessTarget: 'bridge-daemon', status: 'active'}
        }];

        const decision = decideProvision({plan, existing});

        expect(decision.valid).toBe(true);
        expect(decision.surfaces.wake).toBe('exists');
    });

    test('committed-roster residents refuse: their seed era belongs to identityRootsMigration', () => {
        const plan     = buildPlan({instanceId: '@neo-fable', model: 'Claude Fable 5'});
        const decision = decideProvision({plan, existing: {}});

        expect(decision.valid).toBe(false);
        expect(decision.writes).toEqual([]);
        expect(decision.reason).toContain('identityRootsMigration');
    });

    test('corrupt existing chains refuse loudly: episodes without an anchor, and invalid chains', () => {
        const plan     = buildPlan();
        const orphaned = decideProvision({plan, existing: {
            episodeRows: [{id: 'embodied-episode-x', label: 'EmbodiedEpisode', properties: {identityKey: plan.instanceId, model: 'm', family: 'claude', since: FIXED_NOW, until: null}}]
        }});

        expect(orphaned.valid).toBe(false);
        expect(orphaned.reason).toContain('without their IdentityState anchor');

        const existing = existingFromPlan(plan);

        // two open eras — the chain contract consumers rely on no longer holds
        existing.episodeRows = [
            existing.episodeRows[0],
            {id: 'embodied-episode-dup', label: 'EmbodiedEpisode', properties: {identityKey: plan.instanceId, model: 'm2', family: 'claude', since: '2026-07-11T00:00:00Z', until: null}}
        ];

        const corrupt = decideProvision({plan, existing});

        expect(corrupt.valid).toBe(false);
        expect(corrupt.reason).toContain('era chain');
        expect(corrupt.writes).toEqual([]);
    });

    test('unparseable existing rows refuse instead of deciding against corrupt state', () => {
        const plan     = buildPlan();
        const decision = decideProvision({plan, existing: {identityRow: {id: plan.instanceId, parseError: 'Unexpected token'}}});

        expect(decision.valid).toBe(false);
        expect(decision.reason).toContain('unparseable');
        expect(decision.writes).toEqual([]);
    });
});

test.describe('provisionAgentIdentity — storage read + injectable write seam', () => {

    /**
     * @summary Creates the minimal graph storage schema (the durable `Nodes` table the wake
     * substrate and the seed script peek through).
     * @param {Object} db Open better-sqlite3 connection.
     */
    function createGraphSchema(db) {
        db.exec(`
            CREATE TABLE Nodes (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
        `);
    }

    /**
     * @summary Inserts one persisted graph node fixture.
     * @param {Object} db Open better-sqlite3 connection.
     * @param {Object} spec A plan write spec (`{id, type, properties}`).
     */
    function insertSpec(db, spec) {
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)')
            .run(spec.id, JSON.stringify({id: spec.id, label: spec.type, properties: spec.properties}));
    }

    test('readExistingState reads the durable rows the decision needs, and feeds an exists-everywhere verdict', () => {
        const plan = buildPlan();
        const db   = new Database(':memory:');

        try {
            createGraphSchema(db);
            insertSpec(db, plan.writeSpecs.identity);
            insertSpec(db, plan.writeSpecs.identityState);
            insertSpec(db, plan.writeSpecs.episode);
            insertSpec(db, plan.writeSpecs.wakeSubscription);

            const existing = readExistingState(db, plan);

            expect(existing.identityRow.label).toBe('AgentIdentity');
            expect(existing.identityStateRow.properties.identityKey).toBe(plan.instanceId);
            expect(existing.episodeRows).toHaveLength(1);
            expect(existing.wakeRows).toHaveLength(1);

            const decision = decideProvision({plan, existing});

            expect(decision.valid).toBe(true);
            expect(decision.alreadyProvisioned).toBe(true);
        } finally {
            db.close();
        }
    });

    test('readExistingState on a fresh graph returns absent surfaces → full create decision', () => {
        const plan = buildPlan();
        const db   = new Database(':memory:');

        try {
            createGraphSchema(db);

            const existing = readExistingState(db, plan);

            expect(existing.identityRow).toBeNull();
            expect(existing.identityStateRow).toBeNull();
            expect(existing.episodeRows).toEqual([]);
            expect(existing.wakeRows).toEqual([]);

            expect(decideProvision({plan, existing}).writes).toEqual(planWrites(plan));
        } finally {
            db.close();
        }
    });

    test('executeProvision replays the decision through the injected graph adapter, in order', () => {
        const plan     = buildPlan();
        const decision = decideProvision({plan, existing: {}});
        const calls    = [];
        const graph    = {
            upsertGlobalNode: spec => calls.push(['upsertGlobalNode', spec.id]),
            upsertNode      : spec => calls.push(['upsertNode', spec.id]),
            linkNodes       : (source, target, relationship, weight) => calls.push(['linkNodes', `${source}|${target}|${relationship}|${weight}`])
        };

        const execution = executeProvision({decision, graph});

        expect(execution.valid).toBe(true);
        expect(calls).toEqual([
            ['upsertGlobalNode', plan.writeSpecs.identity.id],
            ['upsertGlobalNode', plan.writeSpecs.identityState.id],
            ['upsertGlobalNode', plan.writeSpecs.episode.id],
            ['upsertNode',       plan.writeSpecs.wakeSubscription.id],
            ['linkNodes',        `${plan.instanceId}|${plan.writeSpecs.wakeSubscription.id}|SUBSCRIBES_TO|1`]
        ]);
    });

    test('executeProvision is fail-closed: invalid decisions and incomplete adapters execute NOTHING', () => {
        const plan  = buildPlan();
        const calls = [];
        const graph = {
            upsertGlobalNode: () => calls.push('x'),
            upsertNode      : () => calls.push('x'),
            linkNodes       : () => calls.push('x')
        };

        const invalid = executeProvision({decision: {valid: false, writes: planWrites(plan)}, graph});
        expect(invalid.valid).toBe(false);
        expect(calls).toEqual([]);

        const noAdapter = executeProvision({decision: decideProvision({plan, existing: {}}), graph: {upsertNode: () => {}}});
        expect(noAdapter.valid).toBe(false);
        expect(calls).toEqual([]);
    });
});

test.describe('provisionAgentIdentity — R3b follow-up contract', () => {

    test('the checklist names exactly the five committed-file surfaces, and the script never writes them', () => {
        expect(R3B_FOLLOW_UP_CHECKLIST).toHaveLength(5);

        const joined = R3B_FOLLOW_UP_CHECKLIST.join('\n');

        expect(joined).toContain('ai/graph/identityRoots.mjs');
        expect(joined).toContain('README.md');
        expect(joined).toContain('learn/agentos/ModelStats.md');
        expect(joined).toContain('ai/graph/identityRootsMigration.mjs');
        expect(joined).toContain('test/playwright/unit/ai/graph/identityRoots.spec.mjs');

        // the write plan touches ONLY graph nodes/edges — no write op ever names a committed file
        const writes = planWrites(buildPlan());

        for (const write of writes) {
            expect(['upsertGlobalNode', 'upsertNode', 'linkNodes']).toContain(write.op);
        }
    });
});
