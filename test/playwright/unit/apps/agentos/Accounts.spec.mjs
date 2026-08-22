import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSAccountsTest'
    }
});

import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import Instance        from '../../../../../src/manager/Instance.mjs';
import Accounts        from '../../../../../apps/agentos/view/AccountsPanel.mjs';

import {runConfigIntentRoundTrip} from '../../../../../apps/agentos/util/configIntentRoundTrip.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../..'),
    viewPath   = path.join(repoRoot, 'apps/agentos/view/AccountsPanel.mjs');

test.describe('AgentOS.view.AccountsPanel credential boundary', () => {
    test('accepted creation applies the canonical Brain response, emits the owner intent, and clears the PAT', async () => {
        const
            canonical = {
                id            : 'resident-42',
                githubUsername: 'canonical-login',
                harnessType   : 'antigravity',
                updatedAt     : '2026-07-14T00:00:00.000Z'
            },
            calls     = [],
            form      = {
                getSubmitValues: async () => ({
                    credential    : 'ghp_should_not_escape',
                    githubUsername: '  submitted-login  ',
                    harnessType   : 'codex'
                }),
                validate: async () => true
            },
            stub      = {
                clearCredentialField       : async () => calls.push(['clear']),
                fire                       : (name, data) => calls.push(['fire', name, data]),
                getReference               : reference => reference === 'agent-form' ? form : null,
                submitToFleetRegistryBridge: async payload => {
                    calls.push(['submit', payload]);
                    return canonical
                },
                updateBridgeStatus         : (state, message) => calls.push(['status', state, message]),
                upsertPublicAgentDefinition: (definition, credential) => calls.push(['upsert', definition, credential])
            };

        await Accounts.prototype.onSubmitAgentClick.call(stub);

        expect(calls[0]).toEqual(['submit', {
            credential    : 'ghp_should_not_escape',
            githubUsername: 'submitted-login',
            harnessType   : 'codex'
        }]);
        expect(calls[1]).toEqual(['upsert', canonical, 'ghp_should_not_escape']);
        expect(calls[2]).toEqual(['fire', 'agentDefinitionAccepted', {agent: canonical}]);
        expect(calls[3]).toEqual(['status', 'is-live', 'Agent added. PAT was not retained in the app worker.']);
        expect(calls[4]).toEqual(['clear'])
    });

    test('shell creation sends public intent only and never hands a PAT to the App-Worker bridge', async () => {
        const
            credential = 'ghp_must_not_cross_shell_boundary',
            canonical  = {
                id            : 'resident-shell',
                githubUsername: 'canonical-login',
                harnessType   : 'opencode'
            },
            calls      = [],
            form       = {
                getSubmitValues: async () => ({
                    credential,
                    githubUsername: '  submitted-login  ',
                    harnessType   : 'opencode'
                }),
                validate: async () => true
            },
            previousOS = globalThis.AgentOS,
            stub       = {
                clearCredentialField       : async () => calls.push(['clear']),
                fire                       : (name, data) => calls.push(['fire', name, data]),
                getReference               : reference => reference === 'agent-form' ? form : null,
                submitToFleetRegistryBridge: Accounts.prototype.submitToFleetRegistryBridge,
                updateBridgeStatus         : (state, message) => calls.push(['status', state, message]),
                upsertPublicAgentDefinition: (definition, submittedCredential) => {
                    calls.push(['upsert', definition, submittedCredential])
                }
            };

        globalThis.AgentOS = {
            ...previousOS,
            fleet: {
                ...previousOS?.fleet,
                registryBridge: {
                    credentialIngress: 'shell',
                    defineAgent      : async payload => {
                        calls.push(['submit', payload]);
                        return canonical
                    }
                }
            }
        };

        try {
            await Accounts.prototype.onSubmitAgentClick.call(stub)
        } finally {
            globalThis.AgentOS = previousOS
        }

        expect(calls[0]).toEqual(['submit', {
            githubUsername: 'submitted-login',
            harnessType   : 'opencode'
        }]);
        expect(JSON.stringify(calls[0])).not.toContain(credential);
        expect(calls[1]).toEqual(['upsert', canonical, undefined]);
        expect(calls[2]).toEqual(['fire', 'agentDefinitionAccepted', {agent: canonical}]);
        expect(calls[3]).toEqual(['status', 'is-live', 'Agent added. Credential entry stayed in the native shell.']);
        expect(calls[4]).toEqual(['clear'])
    });

    test('shell mode removes the Accounts PAT field before mount', () => {
        const
            previousOS = globalThis.AgentOS,
            bridge     = {credentialIngress: 'shell', defineAgent: async () => ({})};

        globalThis.AgentOS = {...previousOS, fleet: {...previousOS?.fleet, registryBridge: bridge}};

        let view;

        try {
            view = Neo.create(Accounts, {appName: 'AgentOSAccountsTest'});
            expect(view.getReference('agent-form').items.some(item => item.name === 'credential')).toBe(false)
        } finally {
            view?.destroy();
            globalThis.AgentOS = previousOS
        }
    });

    test('controlled registry rejection renders its reason without a Body mutation and still clears the PAT', async () => {
        const
            calls = [],
            form  = {
                getSubmitValues: async () => ({
                    credential    : 'ghp_retry',
                    githubUsername: 'duplicate',
                    harnessType   : 'codex'
                }),
                validate: async () => true
            },
            stub  = {
                clearCredentialField       : async () => calls.push(['clear']),
                fire                       : () => calls.push(['unexpected-fire']),
                getReference               : reference => reference === 'agent-form' ? form : null,
                submitToFleetRegistryBridge: async () => ({
                    status: 'rejected',
                    reason: "id 'duplicate' already exists; use a scoped update operation."
                }),
                updateBridgeStatus         : (state, message) => calls.push(['status', state, message]),
                upsertPublicAgentDefinition: () => calls.push(['unexpected-upsert'])
            };

        await Accounts.prototype.onSubmitAgentClick.call(stub);

        expect(calls).toEqual([
            ['status', 'is-error', "id 'duplicate' already exists; use a scoped update operation."],
            ['clear']
        ])
    });

    test('view source fails closed without browser persistence or credential logging', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        expect(source).toContain('Fleet Registry bridge unavailable');
        expect(source).toContain('clearCredentialField');
        expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
        expect(source).not.toMatch(/console\.(log|warn|error)/)
    });

    /**
     * The behavioural half, and the load-bearing one. The source check above proves the STRING
     * `localStorage` is absent from ONE FILE — a different claim from "no credential reaches browser
     * storage", and the two come apart the instant any credential handling moves into a sibling
     * module. Verified, not asserted: with a `rememberCredential()` helper extracted next to the view
     * and persisting the PAT, the source check above still passed and the suite stayed at its exact
     * 22/22 baseline. A guard aimed at a filename stops guarding the moment the code leaves the file,
     * and says nothing while it happens. This one records real writes, so it follows the credential
     * into whatever module holds it.
     *
     * Storage and console are ONE boundary, not two. The source check's sibling line makes the same
     * mistake about `console.*` that its storage line makes about `localStorage`: a `console.log(pat)`
     * inside that same extracted helper leaks the credential to logs by the identical mechanism, and
     * the same refactor blinds both guards in a single commit. Covering the storage half alone would
     * have named the defect and then reproduced it one line down. Credit: @neo-opus-grace spotted the
     * twin on review.
     *
     * Three things here are load-bearing, and the first draft of this test got all three wrong —
     * @neo-gpt falsified each against the real head:
     *
     * 1. It drives the REAL `submitToFleetRegistryBridge` / `upsertPublicAgentDefinition` through an
     *    injected bridge and a real store. Stubbing those seams deletes the path the credential
     *    actually crosses: a helper extracted INSIDE the real submit method persisted the PAT while
     *    all 23 specs stayed green. A witness that replaces the subject of its own claim proves
     *    nothing about it.
     * 2. The recorder is a Proxy, not a plain object. `storage[key] = value` is a real persistent
     *    write in Chromium and calls no method, so a method-only recorder watches it in silence.
     * 3. Teardown deletes an ABSENT global rather than restoring `undefined` (the hosted runner has
     *    no `sessionStorage`), and unwinds LIFO so a throw mid-install still restores what was set.
     *
     * The positive control is not decoration: a run that submits NOTHING also writes and logs
     * nothing, so without proof the accepted-add path actually executed through those real seams,
     * both empty sets are vacuous.
     */
    test('no credential byte reaches browser storage OR the console on an accepted add — real seams, behavioural', async () => {
        const
            AgentDefinition = (await import('../../../../../apps/agentos/model/AgentDefinition.mjs')).default,
            Store           = (await import('../../../../../src/data/Store.mjs')).default,
            canonical       = {
                id            : 'resident-42',
                githubUsername: 'canonical-login',
                harnessType   : 'antigravity'
            },
            pat        = 'ghp_should_not_escape',
            writes     = [],
            logged     = [],
            statuses   = [],
            store      = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: []}),
            form       = {
                getSubmitValues: async () => ({credential: pat, githubUsername: 'submitted-login', harnessType: 'codex'}),
                validate       : async () => true
            },
            stub       = {
                agentDefinitionsStore: store,
                clearCredentialField : async () => {},
                fire                 : () => {},
                getReference         : reference => reference === 'agent-form' ? form : null,
                updateBridgeStatus   : (state, message) => statuses.push([state, message]),
                // the REAL credential-bearing seams. Stubbing `submitToFleetRegistryBridge` would
                // delete the very path the credential crosses, and a helper extracted INSIDE it would
                // leak while every assertion here stayed green — the claim would be about a boundary
                // the test had removed.
                submitToFleetRegistryBridge: Accounts.prototype.submitToFleetRegistryBridge,
                upsertPublicAgentDefinition: Accounts.prototype.upsertPublicAgentDefinition
            },
            // Proxy-backed, not a plain object: `storage[key] = value` is a REAL persistent write in
            // Chromium and reaches no method, so a method-only recorder watches it happen in silence.
            // The trap covers the mutation surface; reads stay inert.
            recorder   = kind => new Proxy({
                clear     : ()     => writes.push([kind, 'clear']),
                getItem   : ()     => null,
                key       : ()     => null,
                length    : 0,
                removeItem: key    => writes.push([kind, 'removeItem', key]),
                setItem   : (k, v) => writes.push([kind, 'setItem', k, v])
            }, {
                defineProperty(target, key, descriptor) {
                    writes.push([kind, 'defineProperty', key, descriptor?.value]);
                    return true
                },
                set(target, key, value) {
                    writes.push([kind, 'set', key, value]);
                    return true
                }
            }),
            kinds      = ['localStorage', 'sessionStorage'],
            levels     = ['debug', 'error', 'info', 'log', 'warn'],
            realOS     = globalThis.AgentOS,
            // LIFO teardown. Each entry is pushed BEFORE its mutation, so a throw part-way through
            // install still unwinds everything already installed.
            undo       = [];

        // the injected bridge the REAL submit seam reads off globalThis
        globalThis.AgentOS = {...realOS, fleet: {registryBridge: {defineAgent: async () => canonical}}};

        try {
            kinds.forEach(kind => {
                const original = Object.getOwnPropertyDescriptor(globalThis, kind);

                // an ABSENT global must be deleted, not restored: the hosted runner has no
                // `sessionStorage`, and defineProperty(…, undefined) throws on the way out
                undo.push(() => original ? Object.defineProperty(globalThis, kind, original) : delete globalThis[kind]);
                Object.defineProperty(globalThis, kind, {configurable: true, value: recorder(kind)})
            });

            levels.forEach(level => {
                const original = console[level];

                undo.push(() => {console[level] = original});
                console[level] = (...args) => logged.push([level, ...args])
            });

            await Accounts.prototype.onSubmitAgentClick.call(stub)
        } finally {
            undo.reverse().forEach(fn => fn());
            globalThis.AgentOS = realOS
        }

        // the positive control: the REAL seams ran to an accepted add, so empty sets mean something
        expect(statuses, 'the accepted-add path must have run through the REAL seams — otherwise both leak checks are vacuous')
            .toEqual([['is-live', 'Agent added. PAT was not retained in the app worker.']]);
        expect(store.get('resident-42')?.githubUsername, 'the real store must hold the canonical record').toBe('canonical-login');
        expect(store.get('resident-42')?.credential, 'and no credential byte in it').toBeUndefined();

        expect(writes, 'no credential byte may reach browser storage, from ANY module on this path').toEqual([]);
        expect(logged, 'no credential byte may reach the console, from ANY module on this path').toEqual([]);
        expect(JSON.stringify([writes, logged])).not.toContain(pat);

        store.destroy()
    });

    test('identity setup writes only the redacted projection to the shared roster', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        // upsert goes through the provider-bound roster store with the canonical Brain response,
        // never a request-derived projection or a module-global singleton import.
        expect(source).toContain("agentDefinitionsStore: 'stores.agentDefinitions'");
        expect(source).toContain("fleetTenantsStore    : 'stores.fleetTenants'");
        expect(source).toContain('store.add(definition)');
        expect(source).toContain('this.upsertPublicAgentDefinition(outcome, payload.credential)');
        expect(source).not.toContain('createPublicAgentDefinition');
        expect(source).not.toContain("from '../store/AgentDefinitions.mjs'");
        expect(source).not.toMatch(/store\.add\(\s*values/)
    });

    test('visible setup actions use product language instead of bridge/protocol labels', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        expect(source).toContain("text   : 'Add agent'");
        expect(source).toContain("text   : 'Use sample'");
        expect(source).toContain("text   : 'Connect harness'");
        expect(source).toContain('Agent setup is unavailable in dev-server mode. Add agent fails closed');
        expect(source).toContain('Harness connection unavailable in dev-server mode. Connect fails closed');

        expect(source).not.toContain("text   : 'Submit to Bridge'");
        expect(source).not.toContain("text   : 'Connect Harness (NL-MCP)'");
        expect(source).not.toContain('Fleet Registry bridge unavailable in dev-server mode. Submit fails closed');
        expect(source).not.toContain('Definition submitted through the Fleet Registry bridge');
        expect(source).not.toContain('External harness connected through the Neural Link bridge')
    })
});

test.describe('AgentOS.view.AccountsPanel NL-MCP connect entry (#13548)', () => {
    let savedAgentOS;

    test.beforeEach(() => { savedAgentOS = globalThis.AgentOS });
    test.afterEach(()  => { globalThis.AgentOS = savedAgentOS });

    test('connectExternalHarnessBridge fails closed when no Neural Link connection bridge is injected', async () => {
        globalThis.AgentOS = undefined; // dev-server / un-shelled app — no Brain-side bridge

        await expect(Accounts.prototype.connectExternalHarnessBridge({action: 'start'}))
            .rejects.toThrow('Neural Link connection bridge unavailable')
    });

    test('connectExternalHarnessBridge forwards exactly the connect request — carries no credential', async () => {
        let received;
        globalThis.AgentOS = {neuralLink: {connectionBridge: {
            manageConnection: async req => { received = req; return {message: 'External harness started'} }
        }}};

        const result = await Accounts.prototype.connectExternalHarnessBridge({action: 'start'});

        expect(received).toEqual({action: 'start'}); // exactly the NL-MCP request shape...
        expect(received.credential).toBeUndefined();  // ...with no credential crossing the boundary
        expect(result.message).toBe('External harness started')
    });

    test('onConnectExternalHarnessClick reports is-live on a successful connect', async () => {
        const calls = [];
        const stub  = {
            connectExternalHarnessBridge: async request => {
                expect(request).toEqual({action: 'start'});
                return {message: 'External harness started'}
            },
            updateBridgeStatus: (stateCls, message) => calls.push({stateCls, message})
        };

        await Accounts.prototype.onConnectExternalHarnessClick.call(stub);

        expect(calls).toHaveLength(1);
        expect(calls[0].stateCls).toBe('is-live');
        expect(calls[0].message).toContain('External harness started')
    });

    test('onConnectExternalHarnessClick fails closed to is-error when the bridge is unavailable', async () => {
        const calls = [];
        const stub  = {
            connectExternalHarnessBridge: async () => { throw new Error('Neural Link connection bridge unavailable') },
            updateBridgeStatus          : (stateCls, message) => calls.push({stateCls, message})
        };

        await Accounts.prototype.onConnectExternalHarnessClick.call(stub);

        expect(calls).toHaveLength(1);
        expect(calls[0].stateCls).toBe('is-error');     // never throws out of the handler...
        expect(calls[0].message).toMatch(/fails closed/i) // ...reports the fail-closed state instead
    });

    test('the connect path stays credential-free and fails closed in source', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        expect(source).toContain('connectExternalHarnessBridge');
        expect(source).toContain('neuralLink?.connectionBridge');
        expect(source).toContain('Neural Link connection bridge unavailable');
        // the connect handler/bridge invoke manage_connection with {action} only — never a credential
        expect(source).toMatch(/connectExternalHarnessBridge\(\{action: 'start'\}\)/)
    })
});

test.describe('AgentOS.view.AccountsPanel — agent-scoped configuration (multiple agents)', () => {
    let AgentDefinition, Store;

    test.beforeAll(async () => {
        AgentDefinition = (await import('../../../../../apps/agentos/model/AgentDefinition.mjs')).default;
        Store           = (await import('../../../../../src/data/Store.mjs')).default
    });

    // prototype-call rig with a REAL store attached through the REAL listener path (store
    // mutations fire `load` themselves); selector + card are capture stubs. selectedAgentId is
    // wired as an accessor so assignments run the real afterSet, mirroring the reactive config.
    const makeScopedAccounts = store => {
        const
            selector = {
                items: [],
                add(items) { this.items.push(...[].concat(items)) },
                removeAll() { this.items = [] }
            },
            card     = {
                record      : undefined,
                refreshCount: 0,
                refresh() { this.refreshCount++ },
                setSaveStatus(agentId, state, reason) {
                    if (this.record?.id === agentId) this.saveStatus = {agentId, state, reason}
                }
            };

        const stub = {
            id                     : `accounts-scoped-stub-${Math.abs(store.id.length)}-${store.id}`,
            agentDefinitionsStore  : store,
            agentConfigSaveStatuses: new Map(),
            card,
            selector,
            afterSetSelectedAgentId: Accounts.prototype.afterSetSelectedAgentId,
            getReference           : reference => reference === 'agent-selector' ? selector
                                               : reference === 'agent-config-card' ? card : null,
            onAgentRosterChange: Accounts.prototype.onAgentRosterChange,
            onSelectAgentClick : Accounts.prototype.onSelectAgentClick,
            syncAgentSelector  : Accounts.prototype.syncAgentSelector,

            _selectedAgentId: null,
            get selectedAgentId() { return this._selectedAgentId },
            set selectedAgentId(value) {
                const oldValue = this._selectedAgentId;
                this._selectedAgentId = value;
                this.afterSetSelectedAgentId(value, oldValue)
            }
        };

        Accounts.prototype.afterSetAgentDefinitionsStore.call(stub, store, null);

        return stub
    };

    const makeAgentStore = data => Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data});

    test('the selector strip derives one button per agent from the store; the first agent is scoped by default', () => {
        const store = makeAgentStore([
            {id: 'neo-gpt',  githubUsername: 'neo-gpt',  harnessType: 'codex'},
            {id: 'neo-vega', githubUsername: 'neo-vega', harnessType: 'claude-desktop', displayName: 'Vega'}
        ]);
        const stub = makeScopedAccounts(store);

        expect(stub.selector.items.map(item => item.agentId)).toEqual(['neo-gpt', 'neo-vega']);
        // product language: the display name when present, the username otherwise
        expect(stub.selector.items.map(item => item.text)).toEqual(['neo-gpt', 'Vega']);
        expect(stub.selectedAgentId).toBe('neo-gpt');
        expect(stub.card.record?.id).toBe('neo-gpt');

        store.destroy()
    });

    test('a definition ADDED to the store joins the selector strip — the Viewport upsert path fires `mutate`, not `load` (#15440)', () => {
        const store = makeAgentStore([
            {id: 'neo-gpt', githubUsername: 'neo-gpt', harnessType: 'codex'}
        ]);
        const stub = makeScopedAccounts(store);

        expect(stub.selector.items.map(item => item.agentId)).toEqual(['neo-gpt']);

        // the accepted-definition composition boundary: Viewport lands the canonical readback via
        // `store.add()` — a membership change, which fires `mutate` (`load` never fires for it)
        store.add({id: 'neo-phoebe', githubUsername: 'neo-phoebe', harnessType: 'codex'});

        expect(stub.selector.items.map(item => item.agentId)).toEqual(['neo-gpt', 'neo-phoebe']);

        store.destroy()
    });

    test('selecting an agent scopes the configuration card to ITS record', () => {
        const store = makeAgentStore([
            {id: 'a', githubUsername: 'a', harnessType: 'codex'},
            {id: 'b', githubUsername: 'b', harnessType: 'antigravity', mcpServers: {'github-workflow': true}}
        ]);
        const stub = makeScopedAccounts(store);

        stub.onSelectAgentClick({component: {agentId: 'b'}});

        expect(stub.selectedAgentId).toBe('b');
        expect(stub.card.record?.id).toBe('b');
        expect(stub.card.record?.mcpServers).toEqual({'github-workflow': true});

        store.destroy()
    });

    test('save feedback stays keyed to its agent across selection changes', () => {
        const store = makeAgentStore([
            {id: 'a', githubUsername: 'a', harnessType: 'codex'},
            {id: 'b', githubUsername: 'b', harnessType: 'antigravity'}
        ]);
        const stub = makeScopedAccounts(store);

        stub.agentConfigSaveStatuses.set('a', {state: 'pending', reason: 'Saving A…'});
        stub.onSelectAgentClick({component: {agentId: 'b'}});
        expect(stub.card.record.id).toBe('b');
        expect(stub.card.saveStatus?.agentId).not.toBe('a');

        stub.onSelectAgentClick({component: {agentId: 'a'}});
        expect(stub.card.saveStatus).toEqual({agentId: 'a', state: 'pending', reason: 'Saving A…'});

        store.destroy()
    });

    test('roster changes flow through the REAL store listener: adds appear, removing the scoped agent falls back to the first', () => {
        const store = makeAgentStore([{id: 'a', githubUsername: 'a', harnessType: 'codex'}]);
        const stub  = makeScopedAccounts(store);

        // an add fires the store's own load event → the selector re-derives
        store.add({id: 'b', githubUsername: 'b', harnessType: 'codex'});
        expect(stub.selector.items.map(item => item.agentId)).toEqual(['a', 'b']);

        stub.onSelectAgentClick({component: {agentId: 'b'}});
        store.remove('b');

        // the scoped agent vanished — fail toward the first resident, never a dangling scope
        expect(stub.selector.items.map(item => item.agentId)).toEqual(['a']);
        expect(stub.selectedAgentId).toBe('a');
        expect(stub.card.record?.id).toBe('a');

        store.destroy()
    });

    test('canonical add readback becomes a real model record; malformed or echoing responses fail before mutation', () => {
        const store = makeAgentStore([{id: 'a', githubUsername: 'a', harnessType: 'codex'}]);
        const stub  = makeScopedAccounts(store);

        stub.upsertPublicAgentDefinition = Accounts.prototype.upsertPublicAgentDefinition;
        stub.upsertPublicAgentDefinition({
            id            : 'canonical-id',
            githubUsername: 'canonical-login',
            harnessType   : 'antigravity',
            updatedAt     : '2026-07-14T00:00:00.000Z'
        }, 'ghp_must_not_escape');

        expect(stub.selectedAgentId).toBe('canonical-id');
        expect(stub.card.record?.githubUsername).toBe('canonical-login');
        expect(stub.card.record?.harnessType).toBe('antigravity');
        expect(stub.card.record?.updatedAt).toBe('2026-07-14T00:00:00.000Z');
        expect(stub.card.record?.credential).toBeUndefined();
        expect(stub.card.record?.pat).toBeUndefined();

        const count = store.count;

        expect(() => stub.upsertPublicAgentDefinition({
            id            : 'echoing-id',
            githubUsername: 'echoing-login',
            harnessType   : 'codex',
            credential    : 'ghp_must_not_escape'
        }, 'ghp_must_not_escape')).toThrow('invalid public agent definition');
        expect(() => stub.upsertPublicAgentDefinition({
            id            : 'missing-harness',
            githubUsername: 'missing-harness'
        }, 'ghp_other')).toThrow('invalid public agent definition');
        expect(store.count).toBe(count);
        expect(store.get('echoing-id')).toBeNull();
        expect(store.get('missing-harness')).toBeNull();

        store.destroy()
    });

    test('the harness radios derive from the registry — one registration reaches the form', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        expect(source).toContain('listHarnessTypes().map');
        // no hand-rolled harness radio literals survive
        expect(source).not.toMatch(/valueLabel\s*:\s*'(Codex|Claude|Antigravity|Native)'/)
    });
});

// The cycle-2 review's falsifier, covered with REAL objects: a recordChange mutates fields
// WITHOUT changing record identity, and the reactive `record` config suppresses same-identity
// assignments — the card must still re-render (refresh), and the intent path must fire from the
// real vdom-derived ids.
test.describe('AgentOS.view.AgentConfigCard — live same-record propagation + configIntent (real objects)', () => {
    let AgentConfigCard, AgentDefinition, FleetTenants, Store, savedAgentOS;

    test.beforeAll(async () => {
        AgentConfigCard = (await import('../../../../../apps/agentos/view/fleet/detail/AgentConfigComponent.mjs')).default;
        AgentDefinition = (await import('../../../../../apps/agentos/model/AgentDefinition.mjs')).default;
        FleetTenants    = (await import('../../../../../apps/agentos/store/FleetTenants.mjs')).default;
        Store           = (await import('../../../../../src/data/Store.mjs')).default
    });

    // AgentOS is the APP NAMESPACE (every registered AgentOS.* class lives under it). The bridge
    // stubs below replace it wholesale for their window — fine in-test (nothing here resolves an
    // app class by name) — but it must be RESTORED, never deleted: under fullyParallel a worker
    // interleaves tests from OTHER files, and a deleted namespace makes any later `Neo.create`
    // of an AgentOS view in that worker fail with "Class … does not exist".
    test.beforeEach(() => { savedAgentOS = globalThis.AgentOS });
    test.afterEach(()  => { globalThis.AgentOS = savedAgentOS });

    const cardText = card => JSON.stringify(card.vdom.cn);

    test('a same-record field change re-renders the card through refresh() — the stale-state falsifier', () => {
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'vega', githubUsername: 'vega', harnessType: 'codex', hooksActive: null}
        ]});
        const record = store.get('vega');
        const card   = Neo.create(AgentConfigCard, {record});

        const unreadRows = () => (cardText(card).match(/Not read back yet/g) || []).length;

        expect(unreadRows()).toBe(2); // Hooks + Wake subscriptions both unobserved

        // the review's exact schedule: mutate the SAME record instance, then the same-identity
        // assignment path (suppressed by the reactive config) — refresh() must close the gap
        record.set({hooksActive: true});
        card.record = record;   // suppressed: identity unchanged
        card.refresh();         // the owning view's roster-change hook

        expect(unreadRows()).toBe(1); // Hooks now renders its observed state...
        expect(cardText(card)).toContain('"text":"Hooks"'); // ...as the On row
        expect(cardText(card)).toMatch(/"text":"Hooks"\},\{"cls":\["fm-config-value"\],"text":"On"/);

        // reselection / teardown leaves no stale state behind
        card.record = null;
        expect(cardText(card)).toContain('Select an agent');

        card.destroy();
        store.destroy()
    });

    test('server-row and harness-chip clicks fire the flat sparse intent; pending blocks overlap', () => {
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex', mcpServers: {'memory-core': true}}
        ]});
        const record  = store.get('ada');
        const card    = Neo.create(AgentConfigCard, {record});
        const intents = [];

        card.on('configIntent', data => intents.push(data));

        // the vdom-derived row ids ARE the click contract
        card.onCardClick({path: [{id: `${card.id}__srv__memory-core`}]});
        card.onCardClick({path: [{id: `${card.id}__harness__claude-code`}]});
        card.onCardClick({path: [{id: `${card.id}__harness__codex`}]});      // same harness → no intent
        card.onCardClick({path: [{id: 'unrelated-node'}]});                  // off-card → no intent

        expect(intents.length).toBe(2);
        expect(intents[0]).toMatchObject({id: 'ada', mcpServers: {'memory-core': false}});
        expect(intents[1]).toMatchObject({id: 'ada', harnessType: 'claude-code'});
        expect(intents[0].source).toBe(card.id); // event envelope exists; Accounts strips it before wire

        card.setSaveStatus('ada', 'pending', 'Saving configuration…');
        card.onCardClick({path: [{id: `${card.id}__srv__memory-core`}]});
        expect(intents).toHaveLength(2);
        expect(cardText(card)).toContain('Saving configuration');

        // Returning the sole override to its live default emits null, never a resolved matrix.
        card.setSaveStatus('ada', 'idle');
        record.set({mcpServers: {'memory-core': false}});
        card.refresh();
        card.onCardClick({path: [{id: `${card.id}__srv__memory-core`}]});
        expect(intents[2]).toMatchObject({id: 'ada', mcpServers: null});

        // the record itself is untouched — the owning view writes only from the bridge RESPONSE
        expect(record.mcpServers).toEqual({'memory-core': false});
        expect(record.harnessType).toBe('codex');

        card.destroy();
        store.destroy()
    });

    test('a server row names the registry as its authority — never a bare Off implying observation (#17306)', () => {
        // The incident: this seat had filed four issues through its github-workflow server within the
        // hour while the pane rendered `GitHub workflow: Off`. The registry declaration was all the
        // pane knew, and a bare `Off` claimed an observation nobody made.
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'clio', githubUsername: 'clio', harnessType: 'codex', mcpServers: {'github-workflow': false, 'memory-core': true}}
        ]});
        const card = Neo.create(AgentConfigCard, {record: store.get('clio')});
        const text = cardText(card);

        expect(text).toContain('"text":"Declared off"');
        expect(text).toContain('"text":"Declared on"');

        // The falsifier for the actual defect: no server row may render the bare observation words.
        // Asserting only the presence of "Declared off" would pass while a sibling row still lied.
        expect(text).not.toMatch(/"cls":\["fm-config-value"\],"text":"Off"/);

        // The section carries the authority too, so the grain is readable without parsing each row.
        expect(text).toContain('Servers · declared');
        expect(text).toContain('Memory & knowledge · declared');

        card.destroy();
        store.destroy()
    });

    test('read-back rows keep the plain state words — the fix must not relabel observations (#17306)', () => {
        // Negative control. Marking every row "declared" would satisfy the assertion above and destroy
        // the distinction the ticket exists to create: Operations rows ARE read back, and an observed
        // `On` must stay an observed `On`.
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'vega', githubUsername: 'vega', harnessType: 'codex', hooksActive: true, wakeSubscriptionsActive: null}
        ]});
        const card = Neo.create(AgentConfigCard, {record: store.get('vega')});
        const text = cardText(card);

        expect(text).toMatch(/"text":"Hooks"\},\{"cls":\["fm-config-value"\],"text":"On"/);
        expect(text).toContain('Not read back yet');
        expect(text).toContain('Operations · read back');

        // and the observed row never borrows the declared vocabulary
        expect(text).not.toMatch(/"text":"Hooks"\},\{"cls":\["fm-config-value"\],"text":"Declared/);

        card.destroy();
        store.destroy()
    });

    test('target choices render public availability honestly and emit only the narrow persisted intent', () => {
        const
            store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [{
                id: 'ada', githubUsername: 'ada', harnessType: 'codex'
            }]}),
            tenants = Neo.create(FleetTenants, {data: [{
                id             : 'tenant-a',
                endpoint       : 'https://tenant-a.example.com/agentos',
                status         : 'connected',
                deploymentClass: 'cloud-tenant',
                connectedAt    : '2026-07-27T00:00:00.000Z',
                credential     : 'must-never-enter-the-model'
            }, {
                id      : 'tenant-b',
                endpoint: 'https://tenant-b.example.com/agentos',
                status  : 'disconnected'
            }]}),
            record  = store.get('ada'),
            card    = Neo.create(AgentConfigCard, {record, tenantStore: tenants}),
            intents = [];

        card.on('configIntent', intent => intents.push(intent));

        expect(cardText(card)).toContain('Local services');
        expect(cardText(card)).toContain('https://tenant-a.example.com/agentos');
        expect(cardText(card)).toContain('https://tenant-b.example.com/agentos · Unavailable');
        expect(cardText(card)).not.toContain('must-never-enter-the-model');
        expect(cardText(card)).not.toMatch(/Authorization|Bearer|credentialEnvVar/);
        expect(tenants.get('tenant-a').credential).toBeUndefined();

        card.onCardClick({path: [{id: `${card.id}__target__tenant-a`}]});
        card.onCardClick({path: [{id: `${card.id}__target__tenant-b`}]});

        expect(intents).toHaveLength(1);
        expect(intents[0]).toMatchObject({
            id       : 'ada',
            mcpTarget: {kind: 'tenant', tenantId: 'tenant-a'}
        });
        expect(record.mcpTarget).toBeNull();

        record.set({mcpTarget: {kind: 'tenant', tenantId: 'tenant-a'}});
        card.refresh();
        card.onCardClick({path: [{id: `${card.id}__target__local`}]});

        expect(intents[1]).toMatchObject({id: 'ada', mcpTarget: null});
        expect(record.mcpTarget).toEqual({kind: 'tenant', tenantId: 'tenant-a'});

        card.destroy();
        tenants.destroy();
        store.destroy()
    });

    test('unsupported, disconnected, and missing saved targets stay visible but inert', () => {
        const
            store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [{
                id            : 'desktop',
                githubUsername: 'desktop',
                harnessType   : 'antigravity',
                mcpTarget     : {kind: 'tenant', tenantId: 'missing-tenant'}
            }]}),
            tenants = Neo.create(FleetTenants, {data: [{
                id      : 'connected',
                endpoint: 'https://connected.example.com',
                status  : 'connected'
            }, {
                id      : 'offline',
                endpoint: 'https://offline.example.com',
                status  : 'disconnected'
            }]}),
            card    = Neo.create(AgentConfigCard, {record: store.get('desktop'), tenantStore: tenants}),
            intents = [];

        card.on('configIntent', intent => intents.push(intent));

        expect(cardText(card)).toContain('Unavailable for this harness');
        expect(cardText(card)).toContain('missing-tenant · Saved target unavailable');

        card.onCardClick({path: [{id: `${card.id}__target__connected`}]});
        card.onCardClick({path: [{id: `${card.id}__target__offline`}]});
        card.onCardClick({path: [{id: `${card.id}__target__missing-tenant`}]});

        expect(intents).toEqual([]);

        card.destroy();
        tenants.destroy();
        store.destroy()
    });

    test('tenant Store record changes refresh target availability without reseating the Store', () => {
        const
            store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [{
                id: 'ada', githubUsername: 'ada', harnessType: 'codex'
            }]}),
            tenants = Neo.create(FleetTenants, {data: [{
                id: 'tenant-a', endpoint: 'https://tenant.example.com', status: 'connected'
            }]}),
            card = Neo.create(AgentConfigCard, {record: store.get('ada'), tenantStore: tenants});

        expect(cardText(card)).not.toContain('https://tenant.example.com · Unavailable');

        tenants.get('tenant-a').set({status: 'disconnected'});

        expect(cardText(card)).toContain('https://tenant.example.com · Unavailable');

        card.destroy();
        tenants.destroy();
        store.destroy()
    });

    test('superseded is non-latching: the losing surface can immediately correct (#15440)', () => {
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});
        const card    = Neo.create(AgentConfigCard, {record: store.get('ada')});
        const intents = [];

        card.on('configIntent', data => intents.push(data));

        // pending is the ONLY latching state — a mid-flight save blocks overlap…
        card.setSaveStatus('ada', 'pending', 'Saving configuration…');
        card.onCardClick({path: [{id: `${card.id}__harness__claude-code`}]});
        expect(intents).toHaveLength(0);

        // …but a surface whose request lost to ANOTHER owner's newer change is told so and must
        // stay correctable: a chip latched at pending forever would be a dead affordance
        card.setSaveStatus('ada', 'superseded', 'Superseded by a newer change from another surface.');
        expect(cardText(card)).toContain('Superseded by a newer change');

        card.onCardClick({path: [{id: `${card.id}__harness__claude-code`}]});
        expect(intents).toHaveLength(1);
        expect(intents[0]).toMatchObject({id: 'ada', harnessType: 'claude-code'});

        card.destroy();
        store.destroy()
    });

    test('the Accounts round-trip writes the bridge RESPONSE onto the record and reports honestly', async () => {
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});

        const saveStatuses = [],
              card         = {setSaveStatus: (...args) => saveStatuses.push(args)},
              stub         = {
            agentDefinitionsStore   : store,
            agentConfigSaveStatuses : new Map(),
            onAgentConfigIntent     : Accounts.prototype.onAgentConfigIntent,
            setAgentConfigSaveStatus: Accounts.prototype.setAgentConfigSaveStatus,
            getReference            : ref => ref === 'agent-config-card' ? card : null
        };

        // no bridge → fail closed, nothing mutates
        delete globalThis.AgentOS;
        await stub.onAgentConfigIntent({id: 'ada', harnessType: 'claude-code'});
        expect(store.get('ada').harnessType).toBe('codex');

        // bridge answers → the RESPONSE (not the request) lands on the record
        let received;
        globalThis.AgentOS = {fleet: {registryBridge: {configureAgent: async intent => {
            received = intent;
            return {status: 'accepted', agent: {
                id: 'ada', harnessType: 'native-neo', mcpServers: {'neural-link': false}
            }}
        }}}};

        await stub.onAgentConfigIntent({id: 'ada', harnessType: 'claude-code'});

        const record = store.get('ada');
        expect(received).toEqual({id: 'ada', harnessType: 'claude-code'});
        expect(record.harnessType).toBe('native-neo'); // response, not request
        expect(record.mcpServers).toEqual({'neural-link': false});
        expect(saveStatuses.map(entry => entry[1])).toEqual(['pending', 'rejected', 'pending', 'accepted']);

        delete globalThis.AgentOS;
        store.destroy()
    });

    test('a stale out-of-order save response cannot regress the newer canonical readback', async () => {
        const
            store    = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
                {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
            ]}),
            deferred = [],
            card     = {setSaveStatus: () => {}},
            stub     = {
                agentDefinitionsStore         : store,
                agentDefinitionsLoadGeneration: 0,
                agentConfigSaveStatuses       : new Map(),
                onAgentConfigIntent           : Accounts.prototype.onAgentConfigIntent,
                setAgentConfigSaveStatus      : Accounts.prototype.setAgentConfigSaveStatus,
                getReference                  : () => card
            };

        globalThis.AgentOS = {fleet: {registryBridge: {configureAgent: intent => new Promise(resolve => {
            deferred.push({intent, resolve})
        })}}};

        const older = stub.onAgentConfigIntent({id: 'ada', harnessType: 'claude-code'});
        // Simulate a non-card caller bypassing the pending UI latch: the generation guard is the
        // final defense when two transport responses still overlap.
        stub.agentConfigSaveStatuses.set('ada', {state: 'idle', reason: ''});
        const newer = stub.onAgentConfigIntent({id: 'ada', harnessType: 'native-neo'});

        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;
        deferred[0].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'claude-code', mcpServers: null}});
        await older;

        expect(deferred.map(entry => entry.intent.harnessType)).toEqual(['claude-code', 'native-neo']);
        expect(store.get('ada').harnessType).toBe('native-neo');
        expect(stub.agentConfigSaveStatuses.get('ada').state).toBe('accepted');

        delete globalThis.AgentOS;
        store.destroy()
    });

    test('a rejected domain outcome renders its reason and leaves the real record untouched', async () => {
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});
        const saveStatuses = [];
        const stub         = {
            agentDefinitionsStore         : store,
            agentDefinitionsLoadGeneration: 0,
            agentConfigSaveStatuses       : new Map(),
            onAgentConfigIntent           : Accounts.prototype.onAgentConfigIntent,
            setAgentConfigSaveStatus      : Accounts.prototype.setAgentConfigSaveStatus,
            getReference                  : () => ({setSaveStatus: (...args) => saveStatuses.push(args)})
        };
        globalThis.AgentOS = {fleet: {registryBridge: {configureAgent: async () => ({
            status: 'rejected', reason: "Unknown MCP server 'bogus'."
        })}}};

        await stub.onAgentConfigIntent({id: 'ada', mcpServers: {bogus: true}});

        expect(store.get('ada').harnessType).toBe('codex');
        expect(saveStatuses.at(-1)).toEqual(['ada', 'rejected', "Unknown MCP server 'bogus'."]);

        delete globalThis.AgentOS;
        store.destroy()
    });

    test('cold hydration replaces the placeholder from canonical listAgents; failure preserves last state', async () => {
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'bridge-pending', githubUsername: 'bridge-pending', harnessType: 'codex'}
        ]});
        const stub = {
            agentDefinitionsStore         : store,
            agentDefinitionsLoadGeneration: 0,
            syncAgentSelector             : () => {},
            loadAgentDefinitions          : Accounts.prototype.loadAgentDefinitions
        };

        globalThis.AgentOS = {fleet: {registryBridge: {listAgents: async () => [{
            id: 'canonical', githubUsername: 'canonical', harnessType: 'claude-code', mcpServers: {'memory-core': false}
        }]}}};
        await expect(stub.loadAgentDefinitions()).resolves.toBe(true);
        expect(store.get('bridge-pending')).toBeNull();
        expect(store.get('canonical').mcpServers).toEqual({'memory-core': false});

        globalThis.AgentOS.fleet.registryBridge.listAgents = async () => { throw new Error('offline') };
        await expect(stub.loadAgentDefinitions()).resolves.toBe(false);
        expect(store.get('canonical').harnessType).toBe('claude-code');

        delete globalThis.AgentOS;
        store.destroy()
    });

    test('tenant hydration curates public fields and preserves last-known rows on malformed or failed reads', async () => {
        const
            tenants = Neo.create(FleetTenants, {data: [{
                id: 'placeholder', endpoint: 'https://placeholder.example.com', status: 'connected'
            }]}),
            stub    = {
                fleetTenantsStore         : tenants,
                fleetTenantsLoadGeneration: 0,
                loadFleetTenants          : Accounts.prototype.loadFleetTenants
            };

        globalThis.AgentOS = {fleet: {registryBridge: {listTenants: async () => [{
            id             : 'tenant-a',
            endpoint       : 'https://tenant.example.com/agentos',
            status         : 'connected',
            deploymentClass: 'cloud-tenant',
            connectedAt    : '2026-07-27T00:00:00.000Z',
            credential     : 'must-not-cross',
            headers        : {Authorization: 'Bearer secret'}
        }]}}};

        await expect(stub.loadFleetTenants()).resolves.toBe(true);
        expect(tenants.get('placeholder')).toBeNull();
        expect(tenants.get('tenant-a').toJSON()).toEqual({
            id             : 'tenant-a',
            endpoint       : 'https://tenant.example.com/agentos',
            status         : 'connected',
            deploymentClass: 'cloud-tenant',
            connectedAt    : '2026-07-27T00:00:00.000Z'
        });
        expect(JSON.stringify(tenants.get('tenant-a'))).not.toContain('must-not-cross');
        expect(JSON.stringify(tenants.get('tenant-a'))).not.toContain('Authorization');

        globalThis.AgentOS.fleet.registryBridge.listTenants = async () => [{id: 'broken'}];
        await expect(stub.loadFleetTenants()).resolves.toBe(false);
        expect(tenants.get('tenant-a').status).toBe('connected');

        globalThis.AgentOS.fleet.registryBridge.listTenants = async () => { throw new Error('offline') };
        await expect(stub.loadFleetTenants()).resolves.toBe(false);
        expect(tenants.get('tenant-a').endpoint).toBe('https://tenant.example.com/agentos');

        tenants.destroy()
    });

    test('only the newest tenant-list response may replace the provider Store', async () => {
        const
            tenants  = Neo.create(FleetTenants, {data: [{
                id: 'kept', endpoint: 'https://kept.example.com', status: 'connected'
            }]}),
            deferred = [],
            stub     = {
                fleetTenantsStore         : tenants,
                fleetTenantsLoadGeneration: 0,
                loadFleetTenants          : Accounts.prototype.loadFleetTenants
            };

        globalThis.AgentOS = {fleet: {registryBridge: {listTenants: () => new Promise(resolve => {
            deferred.push(resolve)
        })}}};

        const older = stub.loadFleetTenants();
        const newer = stub.loadFleetTenants();

        deferred[1]([{
            id: 'newer', endpoint: 'https://newer.example.com', status: 'connected'
        }]);
        await expect(newer).resolves.toBe(true);

        deferred[0]([{
            id: 'older', endpoint: 'https://older.example.com', status: 'connected'
        }]);
        await expect(older).resolves.toBe(false);

        expect(tenants.get('newer')).not.toBeNull();
        expect(tenants.get('older')).toBeNull();
        expect(tenants.get('kept')).toBeNull();

        tenants.destroy()
    });

    test('an accepted readback from ANOTHER owner invalidates an older in-flight boot list (#15440)', async () => {
        const store = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});
        const stub = {
            agentDefinitionsStore         : store,
            agentDefinitionsLoadGeneration: 0,
            syncAgentSelector             : () => {},
            loadAgentDefinitions          : Accounts.prototype.loadAgentDefinitions
        };

        let resolveList;

        const priorFleet = globalThis.AgentOS?.fleet;

        globalThis.AgentOS ??= {};
        globalThis.AgentOS.fleet = {registryBridge: {
            listAgents    : () => new Promise(resolve => resolveList = resolve),
            configureAgent: async () => ({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}})
        }};

        // Accounts' boot list goes in flight…
        const load = stub.loadAgentDefinitions();

        // …and the DETAIL owner (a different surface — Accounts' own onAcceptedReadback hook
        // never runs) lands an accepted configure readback meanwhile
        await runConfigIntentRoundTrip({
            intent       : {id: 'ada', harnessType: 'native-neo'},
            owner        : {},
            setSaveStatus: () => {},
            store
        });

        expect(store.get('ada').harnessType).toBe('native-neo');

        // the OLDER list snapshot answers with pre-write truth — the shared write generation
        // moved while it flew, so the whole snapshot is discarded and nothing regresses
        resolveList([{id: 'ada', githubUsername: 'ada', harnessType: 'codex'}]);
        await expect(load).resolves.toBe(false);
        expect(store.get('ada').harnessType).toBe('native-neo');

        globalThis.AgentOS.fleet = priorFleet;
        store.destroy()
    });
});
