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
import Accounts        from '../../../../../apps/agentos/view/Accounts.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../..'),
    viewPath   = path.join(repoRoot, 'apps/agentos/view/Accounts.mjs');

test.describe('AgentOS.view.Accounts credential boundary', () => {
    test('public definition projection strips submitted credential material', () => {
        const values = {
            credential    : 'ghp_should_not_escape',
            githubUsername: 'neo-gpt',
            harnessType   : 'codex',
            pat           : 'also-secret'
        };

        const publicDefinition = Accounts.prototype.createPublicAgentDefinition(values);

        expect(publicDefinition.githubUsername).toBe('neo-gpt');
        expect(publicDefinition.harnessType).toBe('codex');
        expect(JSON.stringify(publicDefinition)).not.toContain('ghp_should_not_escape');
        expect(publicDefinition.credential).toBeUndefined();
        expect(publicDefinition.pat).toBeUndefined()
    });

    test('view source fails closed without browser persistence or credential logging', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        expect(source).toContain('Fleet Registry bridge unavailable');
        expect(source).toContain('clearCredentialField');
        expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
        expect(source).not.toMatch(/console\.(log|warn|error)/)
    });

    test('identity setup writes only the redacted projection to the shared roster', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        // upsert goes through the provider-bound roster store with the redacted projection,
        // never the raw form values / credential — and never a module-global singleton import.
        expect(source).toContain("bind: {agentDefinitionsStore: 'stores.agentDefinitions'}");
        expect(source).toContain('store.add(definition)');
        expect(source).toContain('createPublicAgentDefinition');
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

test.describe('AgentOS.view.Accounts NL-MCP connect entry (#13548)', () => {
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

test.describe('AgentOS.view.Accounts — agent-scoped configuration (multiple agents)', () => {
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
            selector = {items: []},
            card     = {record: undefined};

        const stub = {
            id                     : `accounts-scoped-stub-${Math.abs(store.id.length)}-${store.id}`,
            agentDefinitionsStore  : store,
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

    test('adding an agent scopes the view to it (configure-next flow)', () => {
        const store = makeAgentStore([{id: 'a', githubUsername: 'a', harnessType: 'codex'}]);
        const stub  = makeScopedAccounts(store);

        stub.upsertPublicAgentDefinition = Accounts.prototype.upsertPublicAgentDefinition;
        stub.upsertPublicAgentDefinition(Accounts.prototype.createPublicAgentDefinition({
            githubUsername: 'neo-new',
            harnessType   : 'antigravity'
        }));

        expect(stub.selectedAgentId).toBe('neo-new');
        expect(stub.card.record?.harnessType).toBe('antigravity');

        store.destroy()
    });

    test('the harness radios derive from the registry — one registration reaches the form', () => {
        const source = fs.readFileSync(viewPath, 'utf8');

        expect(source).toContain('listHarnessTypes().map');
        // no hand-rolled harness radio literals survive
        expect(source).not.toMatch(/valueLabel\s*:\s*'(Codex|Claude|Antigravity|Native)'/)
    });
});
