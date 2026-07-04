import {setup} from '../../../../setup.mjs';

const appName = 'CreationStateProviderTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

test.describe('CreationStateProvider — the shared flow-state surface, oracle-guarded (#14718)', () => {
    let ProviderClass, S, E;

    test.beforeAll(async () => {
        ProviderClass = (await import('../../../../../../apps/agentos/view/create/CreationStateProvider.mjs')).default;
        const oracle = await import('../../../../../../apps/agentos/view/create/util/creationFlowState.mjs');
        S = oracle.CREATION_STATES;
        E = oracle.CREATION_EVENTS;
    });

    test('the legal wedge run mutates provider data through the ONE writer', () => {
        const provider = Neo.create(ProviderClass, {});

        expect(provider.getData('flowState')).toBe(S.EMPTY);

        provider.applyFlowEvent(E.COMPOSE);
        expect(provider.getData('flowState')).toBe(S.COMPOSING);

        provider.applyFlowEvent(E.SUBMIT);
        expect(provider.getData('flowState')).toBe(S.GENERATING);

        const accepted = provider.applyCreationRouteOutcome({accepted: true, reason: null});
        expect(accepted.state).toBe(S.MATERIALIZED);
        expect(provider.getData('flowState')).toBe(S.MATERIALIZED);
        expect(provider.getData('flowReason')).toBeNull();

        provider.destroy()
    });

    test('illegal events leave provider data untouched and return the bounded refusal', () => {
        const provider = Neo.create(ProviderClass, {});

        const illegal = provider.applyFlowEvent(E.ACCEPTED); // cannot accept from empty
        expect(illegal.changed).toBe(false);
        expect(illegal.reason).toContain('not legal');
        expect(provider.getData('flowState')).toBe(S.EMPTY);
        expect(provider.getData('flowReason')).toBeNull();

        const unknown = provider.applyFlowEvent('teleport');
        expect(unknown.changed).toBe(false);
        expect(provider.getData('flowState')).toBe(S.EMPTY);

        provider.destroy()
    });

    test('a refused route outcome lands the pipeline reason in flowReason for the ERROR render', () => {
        const provider = Neo.create(ProviderClass, {});

        provider.applyFlowEvent(E.COMPOSE);
        provider.applyFlowEvent(E.SUBMIT);

        const refused = provider.applyCreationRouteOutcome({accepted: false, reason: 'unregistered blueprint schema "iframe@1"'});

        expect(refused.state).toBe(S.ERROR);
        expect(provider.getData('flowState')).toBe(S.ERROR);
        expect(provider.getData('flowReason')).toContain('iframe@1');

        // recovery arc: retry returns to composing and clears the reason
        provider.applyFlowEvent(E.RETRY);
        expect(provider.getData('flowState')).toBe(S.COMPOSING);
        expect(provider.getData('flowReason')).toBeNull();

        // a stray outcome outside generating is a no-op with a reason
        expect(provider.applyCreationRouteOutcome({accepted: true}).changed).toBe(false);
        expect(provider.getData('flowState')).toBe(S.COMPOSING);

        provider.destroy()
    });

    test('the registry is exposed to bindings via stores', () => {
        const provider = Neo.create(ProviderClass, {});

        const store = provider.getStore('createdInstances');

        expect(store).toBeTruthy();
        expect(store.className).toBe('AgentOS.view.create.store.CreatedInstances');
        // the exposed store IS the singleton — one truth across every window's bindings
        expect(typeof store.registerCreated).toBe('function');

        provider.destroy()
    });
});
