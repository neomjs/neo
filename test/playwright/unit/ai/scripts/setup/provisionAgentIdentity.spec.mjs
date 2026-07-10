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
import {
    ENGINE_CLASS_KEYS,
    IDENTITY_CONTRACT_FIELDS,
    R3B_FOLLOW_UP_CHECKLIST,
    SOCIAL_NAME_CLASS_KEYS,
    WAKE_SUBSCRIPTION_DEFAULTS,
    buildProvisionPlan,
    decideProvision,
    deriveDisplayForm,
    executeProvision,
    normalizeInstanceToken,
    parseProvisionArgs,
    planWrites,
    readExistingState,
    renderDecision,
    verifyProvisioned
} from '../../../../../../ai/scripts/setup/provisionAgentIdentity.mjs';

const FIXED_NOW    = '2026-07-10T12:00:00.000Z';
const BASE_OPTIONS = Object.freeze({
    residentId: '@neo-test-agent',
    family    : 'claude',
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
 * @summary Simulates the parsed graph rows a prior successful `--commit` of the SAME plan
 * persisted — the fully-provisioned re-entry fixture (node rows AND the SUBSCRIBES_TO edge).
 * @param {Object} plan A valid plan.
 * @returns {Object} An `existing` shape for decideProvision.
 */
function existingFromPlan(plan) {
    const asRow = spec => ({id: spec.id, label: spec.type, name: spec.name, description: spec.description, properties: spec.properties});

    return {
        identityRow      : asRow(plan.writeSpecs.identity),
        wakeRows         : [asRow(plan.writeSpecs.wakeSubscription)],
        subscribesToEdges: [{id: 'e1', source: plan.residentId, target: plan.writeSpecs.wakeSubscription.id, type: 'SUBSCRIBES_TO'}]
    };
}

/**
 * @summary Opens an in-memory graph database with the durable Nodes/Edges shape the read-set
 * queries against, plus insert helpers mirroring how the graph storage persists rows.
 * @returns {Object} `{sqlite, insertNode, insertEdge}`
 */
function memoryGraph() {
    const sqlite = new Database(':memory:');

    sqlite.exec(`
        CREATE TABLE Nodes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE Edges (id TEXT PRIMARY KEY, source TEXT NOT NULL, target TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
    `);

    const insertNode = spec => sqlite.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(
        spec.id, JSON.stringify({label: spec.type, name: spec.name, description: spec.description, properties: spec.properties})
    );

    const insertEdge = edge => sqlite.prepare('INSERT OR REPLACE INTO Edges (id, source, target, type, data) VALUES (?, ?, ?, ?, ?)').run(
        edge.id || `${edge.source}->${edge.target}`, edge.source, edge.target, edge.relationship || edge.type, JSON.stringify({})
    );

    return {sqlite, insertNode, insertEdge}
}

test.describe('provisionAgentIdentity — Day-0 plan construction (pure half)', () => {

    test('the resident handle is the anchor key everywhere durable — identity id, mailbox owner, wake owner', () => {
        const plan = buildPlan();

        expect(plan.residentId).toBe('@neo-test-agent');
        expect(plan.writeSpecs.identity.id).toBe('@neo-test-agent');
        expect(plan.writeSpecs.identity.properties.identityContract.canonicalIdentityId).toBe('@neo-test-agent');
        expect(plan.writeSpecs.wakeSubscription.properties.agentIdentity).toBe('@neo-test-agent');
        expect(plan.writeSpecs.wakeEdge.source).toBe('@neo-test-agent');
        expect(plan.since).toBe(FIXED_NOW);
    });

    test('NO engine surface exists at Day-0 — the write set carries no episode, no era anchor, no model field anywhere', () => {
        const plan = buildPlan();

        // exactly the three Day-0 ops: resident node, wake node, wake edge
        const writes = planWrites(plan);
        expect(writes.map(write => write.surface)).toEqual(['identity', 'wake', 'wakeEdge']);

        // and no engine fact leaks onto the resident node
        const serialized = JSON.stringify(plan.writeSpecs);
        expect(plan.writeSpecs.identity.properties.model).toBeUndefined();
        expect(serialized).not.toContain('EmbodiedEpisode');
        expect(serialized).not.toContain('IdentityState');
    });

    test('engine-class inputs are rejected loudly — an operator-predicted model is fabricated observation', () => {
        for (const key of ENGINE_CLASS_KEYS) {
            const built = buildProvisionPlan({...BASE_OPTIONS, [key]: 'claude-test-1'});

            expect(built.valid).toBe(false);
            expect(built.reason).toContain('engine-class inputs are rejected by design');
            expect(built.reason).toContain('OBSERVED');
        }
    });

    test('socialName-class inputs are rejected loudly with the ritual pointer', () => {
        for (const key of SOCIAL_NAME_CLASS_KEYS) {
            const built = buildProvisionPlan({...BASE_OPTIONS, [key]: 'Minerva'});

            expect(built.valid).toBe(false);
            expect(built.reason).toContain('socialName-class inputs are rejected by design');
        }
    });

    test('github/mailbox default to the resident handle; explicit values are normalized', () => {
        const plan = buildPlan({githubUsername: 'neo-shared-account', mailbox: '@neo-test-agent-mail'});

        expect(plan.githubUsername).toBe('@neo-shared-account');
        expect(plan.mailbox).toBe('@neo-test-agent-mail');
        expect(plan.writeSpecs.identity.properties.identityContract.requiredA2aMailboxAddress).toBe('@neo-test-agent-mail');

        const defaulted = buildPlan();
        expect(defaulted.githubUsername).toBe('@neo-test-agent');
        expect(defaulted.mailbox).toBe('@neo-test-agent');
    });

    test('the fleet instance id is a plain token (never @-prefixed) and lands as ADDITIVE linkage, not a key', () => {
        expect(normalizeInstanceToken('@euclid-2').valid).toBe(false);
        expect(normalizeInstanceToken('euclid-2')).toEqual({valid: true, reason: null, token: 'euclid-2'});

        const plan = buildPlan({fleetInstanceId: 'euclid-2'});

        expect(plan.fleetInstanceId).toBe('euclid-2');
        expect(plan.writeSpecs.identity.properties.fleetInstanceIds).toEqual(['euclid-2']);
        // the linkage never replaces the resident key
        expect(plan.writeSpecs.identity.id).toBe('@neo-test-agent');

        const without = buildPlan();
        expect(without.writeSpecs.identity.properties.fleetInstanceIds).toEqual([]);
    });

    test('the wake route is the metadata-free Day-0 shape — no fabricated harness facts', () => {
        const plan = buildPlan();
        const wake = plan.writeSpecs.wakeSubscription;

        expect(wake.properties.trigger).toBe(WAKE_SUBSCRIPTION_DEFAULTS.trigger);
        expect(wake.properties.harnessTarget).toBe('mcp-notifications');
        expect(wake.properties.harnessTargetMetadata).toEqual({});
        expect(plan.writeSpecs.wakeEdge.relationship).toBe('SUBSCRIBES_TO');
        expect(plan.writeSpecs.wakeEdge.target).toBe(wake.id);
    });

    test('display form derives from the resident handle; the social layer has no input surface at all', () => {
        expect(deriveDisplayForm('@neo-fable-clio')).toBe('Neo Fable Clio');

        const plan = buildPlan();
        expect(plan.displayForm).toBe('Neo Test Agent');
        // no social-layer write spec exists — unreachable is structural, not filtered
        expect(JSON.stringify(planWrites(plan))).not.toContain('socialLayer');
    });

    test('fails loud on contract violations (no silent default plan)', () => {
        expect(buildProvisionPlan({}).valid).toBe(false);
        expect(buildProvisionPlan({...BASE_OPTIONS, residentId: 'Bad Handle'}).valid).toBe(false);
        expect(buildProvisionPlan({...BASE_OPTIONS, family: 'Claude'}).valid).toBe(false);
        expect(buildProvisionPlan({...BASE_OPTIONS, displayName: '   '}).valid).toBe(false);
        expect(buildProvisionPlan({...BASE_OPTIONS, now: 'not-a-date'}).valid).toBe(false);
        expect(buildProvisionPlan({...BASE_OPTIONS, fleetInstanceId: '  '}).valid).toBe(false);
    });
});

test.describe('provisionAgentIdentity — decideProvision (full read/compare/repair)', () => {

    test('fresh state → exactly the three creates, in dependency order', () => {
        const plan     = buildPlan(),
              decision = decideProvision({plan, existing: {}, rosterIds: []});

        expect(decision.valid).toBe(true);
        expect(decision.alreadyProvisioned).toBe(false);
        expect(decision.surfaces).toEqual({identity: 'create', wake: 'create', wakeEdge: 'create'});
        expect(decision.writes.map(write => write.op)).toEqual(['upsertGlobalNode', 'upsertNode', 'linkNodes']);
    });

    test('fully provisioned re-entry → ZERO operations (the honest idempotent no-op)', () => {
        const plan     = buildPlan(),
              decision = decideProvision({plan, existing: existingFromPlan(plan), rosterIds: []});

        expect(decision.valid).toBe(true);
        expect(decision.alreadyProvisioned).toBe(true);
        expect(decision.writes).toEqual([]);
        expect(decision.surfaces).toEqual({identity: 'exists', wake: 'exists', wakeEdge: 'exists'});
    });

    test('CRASH-WINDOW REPAIR: a wake node WITHOUT its SUBSCRIBES_TO edge is NOT provisioned — the edge is repaired, targeting the EXISTING node', () => {
        const plan     = buildPlan(),
              existing = existingFromPlan(plan);

        // simulate the crash window: node persisted, edge write never landed
        existing.subscribesToEdges = [];
        // and the existing node id differs from the Day-0 template id (a runtime self-registered route)
        existing.wakeRows[0].id = 'WAKE_SUB:runtime-abc123';

        const decision = decideProvision({plan, existing, rosterIds: []});

        expect(decision.valid).toBe(true);
        expect(decision.alreadyProvisioned).toBe(false);
        expect(decision.surfaces.wake).toBe('exists');
        expect(decision.surfaces.wakeEdge).toBe('repair');
        expect(decision.writes).toHaveLength(1);
        expect(decision.writes[0].op).toBe('linkNodes');
        expect(decision.writes[0].edge.target).toBe('WAKE_SUB:runtime-abc123');   // the row that EXISTS, not the template id
    });

    test('a changed mailbox is LOUD divergence, never silently accepted', () => {
        const plan     = buildPlan(),
              existing = existingFromPlan(plan);

        existing.identityRow = {
            ...existing.identityRow,
            properties: {
                ...existing.identityRow.properties,
                identityContract: {...existing.identityRow.properties.identityContract, requiredA2aMailboxAddress: '@somewhere-else'}
            }
        };

        const decision = decideProvision({plan, existing, rosterIds: []});

        expect(decision.valid).toBe(false);
        expect(decision.writes).toEqual([]);
        expect(decision.divergences).toEqual([expect.objectContaining({
            surface : 'identity',
            field   : 'identityContract.requiredA2aMailboxAddress',
            existing: '@somewhere-else',
            planned : '@neo-test-agent'
        })]);
    });

    test('EVERY declared identity-contract field is compared — each one alone triggers loud refusal', () => {
        const plan = buildPlan();

        for (const fieldPath of IDENTITY_CONTRACT_FIELDS) {
            const existing        = existingFromPlan(plan),
                  [parent, child] = fieldPath.split('.'),
                  properties      = {...existing.identityRow.properties};

            if (child) {
                properties[parent] = {...properties[parent], [child]: 'tampered-value'};
            } else {
                properties[parent] = 'tampered-value';
            }

            existing.identityRow = {...existing.identityRow, properties};

            const decision = decideProvision({plan, existing, rosterIds: []});

            expect(decision.valid, `field '${fieldPath}' must be compared`).toBe(false);
            expect(decision.divergences.map(divergence => divergence.field)).toContain(fieldPath);
        }
    });

    test('a wrong-type row on the resident key REFUSES outright — no identity write onto a squatter', () => {
        const plan     = buildPlan(),
              existing = existingFromPlan(plan);

        existing.identityRow = {...existing.identityRow, label: 'Concept'};

        const decision = decideProvision({plan, existing, rosterIds: []});

        expect(decision.valid).toBe(false);
        expect(decision.reason).toContain("type 'Concept', not AgentIdentity");
        expect(decision.writes).toEqual([]);
    });

    test('display-form drift is a non-blocking NOTE — a ritual-granted name never bricks re-entry', () => {
        const plan     = buildPlan(),
              existing = existingFromPlan(plan);

        existing.identityRow = {
            ...existing.identityRow,
            properties: {...existing.identityRow.properties, displayName: 'Minerva'}
        };

        const decision = decideProvision({plan, existing, rosterIds: []});

        expect(decision.valid).toBe(true);
        expect(decision.alreadyProvisioned).toBe(true);
        expect(decision.notes).toEqual([expect.objectContaining({field: 'displayName', existing: 'Minerva'})]);
    });

    test('a NEW fleet instance on an existing resident is an ADDITIVE repair-merge — union, non-clobbering', () => {
        const plan     = buildPlan({fleetInstanceId: 'euclid-2'}),
              existing = existingFromPlan(buildPlan());   // persisted WITHOUT the new instance

        // the persisted resident evolved: a granted name + a previously linked instance
        existing.identityRow = {
            ...existing.identityRow,
            name      : 'Minerva',
            properties: {...existing.identityRow.properties, displayName: 'Minerva', fleetInstanceIds: ['euclid-1']}
        };

        const decision = decideProvision({plan, existing, rosterIds: []});

        expect(decision.valid).toBe(true);
        expect(decision.surfaces.identity).toBe('repair');

        const repair = decision.writes.find(write => write.repair === 'fleet-instance-link');

        expect(repair.op).toBe('upsertGlobalNode');
        expect(repair.spec.properties.fleetInstanceIds).toEqual(['euclid-1', 'euclid-2']);   // union, order-preserving
        expect(repair.spec.name).toBe('Minerva');                                            // the evolved name survives — no clobber
        expect(repair.spec.properties.displayName).toBe('Minerva');
    });

    test('an already-linked fleet instance decides zero-op', () => {
        const plan     = buildPlan({fleetInstanceId: 'euclid-1'}),
              existing = existingFromPlan(plan);

        const decision = decideProvision({plan, existing, rosterIds: []});

        expect(decision.valid).toBe(true);
        expect(decision.alreadyProvisioned).toBe(true);
    });

    test('committed-roster residents are refused — their substrate is owned by the seeding path', () => {
        const plan     = buildPlan(),
              decision = decideProvision({plan, existing: {}, rosterIds: ['@neo-test-agent']});

        expect(decision.valid).toBe(false);
        expect(decision.reason).toContain('committed-roster resident');
    });

    test('an unparseable existing row refuses outright — never decide against corrupt state', () => {
        const plan     = buildPlan(),
              decision = decideProvision({plan, existing: {identityRow: {id: '@neo-test-agent', parseError: 'bad json'}}, rosterIds: []});

        expect(decision.valid).toBe(false);
        expect(decision.reason).toContain('unparseable');
    });

    test('renderDecision on a fully provisioned resident says zero operations, honestly', () => {
        const plan     = buildPlan(),
              decision = decideProvision({plan, existing: existingFromPlan(plan), rosterIds: []}),
              rendered = renderDecision(plan, decision).join('\n');

        expect(rendered).toContain('zero operations');
        expect(rendered).not.toContain('upsertGlobalNode');
    });
});

test.describe('provisionAgentIdentity — read-set + post-verify against a real database', () => {

    test('readExistingState reads nodes AND the SUBSCRIBES_TO edges — the full contract read-set', () => {
        const plan                             = buildPlan(),
              {sqlite, insertNode, insertEdge} = memoryGraph();

        insertNode(plan.writeSpecs.identity);
        insertNode(plan.writeSpecs.wakeSubscription);
        insertEdge(plan.writeSpecs.wakeEdge);

        const existing = readExistingState(sqlite, plan);

        expect(existing.identityRow.id).toBe('@neo-test-agent');
        expect(existing.identityRow.label).toBe('AgentIdentity');
        expect(existing.identityRow.name).toBe('Neo Test Agent');   // surfaced for non-clobbering repair
        expect(existing.wakeRows).toHaveLength(1);
        expect(existing.subscribesToEdges).toEqual([expect.objectContaining({source: '@neo-test-agent', type: 'SUBSCRIBES_TO'})]);

        sqlite.close();
    });

    test('verifyProvisioned FAILS on a partial persist (edge missing) and PASSES once the edge lands', () => {
        const plan                             = buildPlan(),
              {sqlite, insertNode, insertEdge} = memoryGraph();

        insertNode(plan.writeSpecs.identity);
        insertNode(plan.writeSpecs.wakeSubscription);
        // edge NOT written — the crash window

        const partial = verifyProvisioned({sqlite, plan, rosterIds: []});

        expect(partial.valid).toBe(false);
        expect(partial.reason).toContain('did not fully persist');
        expect(partial.remaining).toEqual([expect.stringContaining('SUBSCRIBES_TO')]);

        insertEdge(plan.writeSpecs.wakeEdge);

        expect(verifyProvisioned({sqlite, plan, rosterIds: []})).toEqual({valid: true, reason: null, remaining: []});

        sqlite.close();
    });

    test('the crash-interrupted commit completes on re-run: decide → execute-into-db → verify green', () => {
        const plan                             = buildPlan(),
              {sqlite, insertNode, insertEdge} = memoryGraph();

        // crash window: only the identity landed
        insertNode(plan.writeSpecs.identity);

        const existing = readExistingState(sqlite, plan),
              decision = decideProvision({plan, existing, rosterIds: []});

        expect(decision.valid).toBe(true);
        expect(decision.surfaces.identity).toBe('exists');
        expect(decision.writes.map(write => write.op)).toEqual(['upsertNode', 'linkNodes']);   // exactly the missing rest

        // a graph adapter that persists into the same in-memory database
        const graph = {
            upsertGlobalNode: spec => insertNode(spec),
            upsertNode      : spec => insertNode(spec),
            linkNodes       : (source, target, relationship, weight) => insertEdge({source, target, relationship, weight})
        };

        const execution = executeProvision({decision, graph});

        expect(execution.valid).toBe(true);
        expect(verifyProvisioned({sqlite, plan, rosterIds: []}).valid).toBe(true);

        sqlite.close();
    });
});

test.describe('provisionAgentIdentity — executeProvision (write seam)', () => {

    test('executes the decision delta in order against the injected adapter', () => {
        const plan     = buildPlan(),
              decision = decideProvision({plan, existing: {}, rosterIds: []}),
              calls    = [];

        const graph = {
            upsertGlobalNode: spec => calls.push(['upsertGlobalNode', spec.id]),
            upsertNode      : spec => calls.push(['upsertNode', spec.id]),
            linkNodes       : (source, target, relationship) => calls.push(['linkNodes', `${source}->${target}:${relationship}`])
        };

        const execution = executeProvision({decision, graph});

        expect(execution.valid).toBe(true);
        expect(calls).toEqual([
            ['upsertGlobalNode', '@neo-test-agent'],
            ['upsertNode', 'WAKE_SUB:day0-neo-test-agent'],
            ['linkNodes', '@neo-test-agent->WAKE_SUB:day0-neo-test-agent:SUBSCRIBES_TO']
        ]);
    });

    test('refuses an invalid decision and an incomplete adapter — nothing executes', () => {
        const plan     = buildPlan(),
              decision = decideProvision({plan, existing: {}, rosterIds: []});

        expect(executeProvision({decision: {valid: false}, graph: {}}).valid).toBe(false);
        expect(executeProvision({decision, graph: {upsertGlobalNode: () => {}}}).valid).toBe(false);
    });
});

test.describe('provisionAgentIdentity — CLI argument contract', () => {

    test('parses the full happy path', () => {
        const parsed = parseProvisionArgs([
            '--resident-id', '@neo-test-agent', '--family', 'gpt',
            '--github-username', 'shared-login', '--mailbox', '@neo-test-agent',
            '--fleet-instance-id', 'euclid-2', '--commit'
        ]);

        expect(parsed.valid).toBe(true);
        expect(parsed.options).toEqual({
            commit         : true,
            help           : false,
            residentId     : '@neo-test-agent',
            family         : 'gpt',
            githubUsername : 'shared-login',
            mailbox        : '@neo-test-agent',
            fleetInstanceId: 'euclid-2'
        });
    });

    test('--model is rejected by design with the observation pointer — Day-0 has no engine input', () => {
        const parsed = parseProvisionArgs(['--resident-id', '@x', '--family', 'gpt', '--model', 'gpt-5.6-sol']);

        expect(parsed.valid).toBe(false);
        expect(parsed.reason).toContain('--model is rejected by design');
        expect(parsed.reason).toContain('OBSERVED');
    });

    test('social-name flags are rejected by design with the ritual pointer', () => {
        const parsed = parseProvisionArgs(['--social-name', 'Minerva']);

        expect(parsed.valid).toBe(false);
        expect(parsed.reason).toContain('rejected by design');
        expect(parsed.reason).toContain('ritual');
    });

    test('unknown flags and missing values refuse instead of being silently ignored', () => {
        expect(parseProvisionArgs(['--instance-id', '@x']).valid).toBe(false);   // the SUPERSEDED key form is not silently accepted
        expect(parseProvisionArgs(['--resident-id']).valid).toBe(false);
        expect(parseProvisionArgs(['--resident-id', '--commit']).valid).toBe(false);
    });

    test('the follow-up checklist names the committed surfaces and never claims a Day-0 era opened', () => {
        expect(R3B_FOLLOW_UP_CHECKLIST).toHaveLength(5);
        expect(R3B_FOLLOW_UP_CHECKLIST.join('\n')).toContain('identityRoots.mjs');
        expect(R3B_FOLLOW_UP_CHECKLIST.join('\n')).toContain('OBSERVED embodiment');
    });
});
