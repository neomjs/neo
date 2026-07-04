import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'CreateSurfaceTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

test.describe('CreateSurface — the wedge screen: five states, one provider, the whole spine (#14720)', () => {
    let Controller, Provider, oracle, deterministicBlueprintFallback;

    // a stage double honoring the container seam the controller drives
    const createStageDouble = () => {
        const observers = [];
        return {
            added: [],
            on(event, handler, scope) { event === 'insert' && observers.push([handler, scope]) },
            add(config) {
                this.added.push(config);
                const item = {...config};
                observers.forEach(([handler, scope]) => handler.call(scope || null, {item}));
                return item
            }
        }
    };

    // a controller double: real class instance shape minus the component tree — we drive its
    // handlers with injected provider/stage/field seams
    const createRig = async ({generate, request = 'build me a neo grid'} = {}) => {
        const provider = Neo.create(Provider, {});
        const stage    = createStageDouble();
        const field    = {value: request};

        // a minimal owning-component double: the controller's construct chain walks
        // component.parent, and getProvider reads component.getStateProvider()
        const componentDouble = {
            parent          : null,
            getStateProvider: () => provider,
            down            : () => null,
            on              : () => {},
            un              : () => {}
        };

        const controller = Neo.create(Controller, {component: componentDouble, generateBlueprint: generate || null});

        // seam the reference lookups (the component tree is the SSOT-gated chrome; this
        // spec proves the CONTROLLER contract against the real provider + real spine)
        controller.getReference = name => name === 'create-stage' ? stage : name === 'intent-field' ? field : null;

        // wire the registrar exactly as onComponentConstructed does
        const {createInsertRegistrar}     = await import('../../../../../../apps/agentos/view/create/util/acceptPath.mjs');
        const {default: CreatedInstances} = await import('../../../../../../apps/agentos/view/create/store/CreatedInstances.mjs');
        stage.on('insert', createInsertRegistrar({registry: CreatedInstances}), controller);

        return {provider, stage, field, controller, CreatedInstances}
    };

    test.beforeAll(async () => {
        Controller = (await import('../../../../../../apps/agentos/view/create/CreateSurfaceController.mjs')).default;
        Provider   = (await import('../../../../../../apps/agentos/view/create/CreationStateProvider.mjs')).default;
        oracle     = await import('../../../../../../apps/agentos/view/create/util/creationFlowState.mjs');
        deterministicBlueprintFallback = (await import('../../../../../../apps/agentos/view/create/CreateSurfaceController.mjs')).deterministicBlueprintFallback;
    });

    test('the happy wedge: compose → submit → materialized, instance in the stage AND the registry', async () => {
        const {provider, stage, controller, CreatedInstances} = await createRig();
        const S                                               = oracle.CREATION_STATES;

        expect(provider.getData('flowState')).toBe(S.EMPTY);

        controller.onIntentChange();
        expect(provider.getData('flowState')).toBe(S.COMPOSING);

        await controller.onSubmitIntent();

        expect(provider.getData('flowState')).toBe(S.MATERIALIZED);
        expect(stage.added).toHaveLength(1);                          // the ONE create path was used
        expect(stage.added[0].ntype).toBe('grid-container');

        const instanceId = provider.getData('activeInstanceId');
        expect(instanceId).toMatch(/^keeper-grid-/);

        const record = CreatedInstances.resolveTarget({instanceId});
        expect(record.state).toBe('live');
        expect(record.blueprintSchema).toBe('grid@1');

        provider.destroy(); controller.destroy()
    });

    test('the refusal wedge: a gate-refused blueprint lands ERROR with the pipeline reason; retry recovers', async () => {
        // the injected generator emits an html-key attack — the shared validator must refuse it
        const attack = async () => ({
            schema: 'grid@1', title: 'Evil',
            config: {columns: [{field: 'a', text: 'A', html: '<img onerror=1>'}]},
            data  : []
        });

        const {provider, stage, controller} = await createRig({generate: attack});
        const S                             = oracle.CREATION_STATES;

        controller.onIntentChange();
        await controller.onSubmitIntent();

        expect(provider.getData('flowState')).toBe(S.ERROR);
        expect(provider.getData('flowReason')).toContain('forbidden key'); // the pipeline reason, verbatim
        expect(stage.added).toHaveLength(0);                              // nothing reached the stage

        controller.onRetry();
        expect(provider.getData('flowState')).toBe(S.COMPOSING);          // edit-and-retry, never a dead-end

        provider.destroy(); controller.destroy()
    });

    test('accept-stage refusal AFTER route acceptance lands ERROR with the ACCEPT reason — materialized is accept-path truth', async () => {
        // valid blueprint, but the stage reference is dead — the accept path must refuse AFTER
        // the route accepted, and the provider must never claim materialized
        const {provider, controller} = await createRig();
        const S                      = oracle.CREATION_STATES;

        // sever the stage: route will accept, acceptBlueprint will refuse ("no live stage")
        const originalGetReference = controller.getReference;
        controller.getReference = name => name === 'create-stage' ? null : originalGetReference(name);

        controller.onIntentChange();
        await controller.onSubmitIntent();

        expect(provider.getData('flowState')).toBe(S.ERROR);              // never materialized
        expect(provider.getData('flowReason')).toContain('stage');        // the ACCEPT path's reason, not the route's
        expect(provider.getData('activeInstanceId')).toBeNull();          // no phantom instance

        controller.onRetry();
        expect(provider.getData('flowState')).toBe(S.COMPOSING);          // recoverable like every refusal

        provider.destroy(); controller.destroy()
    });

    test('dispose returns to the empty invitation and flips the registry record', async () => {
        const {provider, controller, CreatedInstances} = await createRig();
        const S                                        = oracle.CREATION_STATES;

        controller.onIntentChange();
        await controller.onSubmitIntent();
        const instanceId = provider.getData('activeInstanceId');

        controller.onDispose();

        expect(provider.getData('flowState')).toBe(S.EMPTY);
        expect(provider.getData('activeInstanceId')).toBeNull();
        expect(CreatedInstances.resolveTarget({instanceId}).state).toBe('disposed');

        provider.destroy(); controller.destroy()
    });

    test('no flow booleans anywhere: state truth lives ONLY on the provider (the §7.5.1 audit line)', async () => {
        const {provider, controller} = await createRig();

        // the controller instance carries no is*/has* flow flags — the provider is the single truth
        const flagKeys = Object.keys(controller).filter(key => /^(is|has)[A-Z]/.test(key) && /generat|error|material|compos|flow/i.test(key));
        expect(flagKeys).toEqual([]);

        // and the fallback generator is deterministic + labeled (the NL seam's placeholder)
        const blueprint = deterministicBlueprintFallback('  My Fleet PRs  ');
        expect(blueprint.schema).toBe('grid@1');
        expect(blueprint.title).toBe('My Fleet PRs');

        provider.destroy(); controller.destroy()
    });
});
