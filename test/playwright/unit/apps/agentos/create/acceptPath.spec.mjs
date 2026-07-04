import {setup} from '../../../../setup.mjs';

const appName = 'AcceptPathTest';

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

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../../src/Neo.mjs';
import * as core           from '../../../../../../src/core/_export.mjs';
import InstanceManager     from '../../../../../../src/manager/Instance.mjs';
import CreatedInstances    from '../../../../../../apps/agentos/view/create/store/CreatedInstances.mjs';
import {BLUEPRINT_SCHEMAS} from '../../../../../../apps/agentos/view/create/util/blueprintSchema.mjs';
import * as accept         from '../../../../../../apps/agentos/view/create/util/acceptPath.mjs';

const validGrid = title => ({
    schema: 'grid@1',
    title,
    config: {columns: [{field: 'name', text: 'Name'}, {field: 'city', text: 'City'}]},
    data  : [{name: 'A', city: 'B'}]
});

// a stage double honoring the seam contract: add() fires the insert observers with the item,
// exactly as the container add → insert path does for the observing controller
const createStageDouble = () => {
    const observers = [];

    return {
        added: [],
        on(event, handler) { event === 'insert' && observers.push(handler) },
        add(config) {
            this.added.push(config);
            // the inserted "component" carries the config's provenance stamp + reference
            const item = {...config};
            observers.forEach(handler => handler({item}));
            return item
        }
    }
};

test.describe('acceptPath — blueprint → live instance via the ONE create path + registry lifecycle', () => {
    test('every validator schema has a registered materializer (coverage contract)', () => {
        for (const schemaId of Object.keys(BLUEPRINT_SCHEMAS)) {
            expect(accept.SCHEMA_MATERIALIZERS[schemaId], `materializer missing for ${schemaId}`).toBeTruthy();
        }
    });

    test('accept → stage add → insert → registry record, end to end on the real registry', () => {
        const stage     = createStageDouble();
        const registrar = accept.createInsertRegistrar({registry: CreatedInstances});

        stage.on('insert', registrar);

        const result = accept.acceptBlueprint({blueprint: validGrid('Accept Grid'), instanceId: 'ap-1', stage});

        expect(result.accepted).toBe(true);
        expect(result.config.ntype).toBe('agentos-created-pane');     // keeper chrome wraps the live widget
        expect(result.config.id).toBe('ap-1-pane');                   // paneRef, not mutation target
        expect(result.config.reference).toBe('ap-1-pane');
        expect(result.config.content.id).toBe('ap-1');                // instance-manager resolvable (Neo.get)
        expect(result.config.content.ntype).toBe('grid-container');   // wire-safe, never a module ref
        expect(result.config.content.reference).toBe('ap-1');
        expect(result.config.content.columns).toEqual([{dataField: 'name', text: 'Name'}, {dataField: 'city', text: 'City'}]);
        expect(stage.added).toHaveLength(1);                          // the ONE create path was used

        // the insert event wrote the registry record with the provenance stamp
        const record = CreatedInstances.resolveTarget({instanceId: 'ap-1'});

        expect(record.state).toBe('live');
        expect(record.blueprintSchema).toBe('grid@1');
        expect(record.paneRef).toBe('ap-1-pane');
        expect(record.blueprintSnapshot.title).toBe('Accept Grid');
    });

    test('accept refusals are staged data: bad blueprint, dead stage, missing id, unstamped inserts', () => {
        const stage = createStageDouble();

        expect(accept.acceptBlueprint({blueprint: validGrid('X'), instanceId: '', stage}))
            .toMatchObject({accepted: false, stage: accept.ACCEPT_STAGES.ACCEPT});

        expect(accept.acceptBlueprint({blueprint: validGrid('X'), instanceId: 'ap-2'}))
            .toMatchObject({accepted: false, stage: accept.ACCEPT_STAGES.ACCEPT});

        // accept-side validation is the SAME validator: an html-key attack refuses here too
        const attack = accept.acceptBlueprint({
            blueprint : {...validGrid('X'), config: {columns: [{field: 'a', text: 'A', html: '<img onerror=1>'}]}},
            instanceId: 'ap-2',
            stage
        });

        expect(attack.accepted).toBe(false);
        expect(attack.reason).toContain('forbidden key');
        expect(stage.added).toHaveLength(0);                          // nothing reached the stage

        // external create_component inserts carry no provenance stamp — the registrar ignores them
        const registrar = accept.createInsertRegistrar({registry: CreatedInstances});

        expect(registrar({item: {ntype: 'grid-container', reference: 'external-1'}})).toBeNull();
        expect(CreatedInstances.resolveTarget({instanceId: 'external-1'})).toBeNull();
    });

    test('mutation pulls the registry snapshot, applies the MERGED blueprint, and records it', () => {
        const stage     = createStageDouble();
        const registrar = accept.createInsertRegistrar({registry: CreatedInstances});

        stage.on('insert', registrar);
        accept.acceptBlueprint({blueprint: validGrid('Mutate Grid'), instanceId: 'ap-m1', stage});

        // a framework-shaped double: the applier goes through set() (the batched mutation path),
        // so the double must honor that contract — a bare property bag correctly REFUSES now
        const component = {
            title: 'Mutate Grid',
            store: {data: []},
            set(values) { Object.assign(this, values) }
        };
        const resolveComponent = id => id === 'ap-m1' ? component : null;

        const grown = accept.mutateInstance({
            instanceId: 'ap-m1',
            mutation  : {config: {height: 500}},
            registry  : CreatedInstances,
            resolveComponent
        });

        expect(grown.accepted).toBe(true);
        expect(component.height).toBe(500);
        expect(grown.blueprint.config.columns).toHaveLength(2);       // merge preserved columns
        expect(CreatedInstances.resolveTarget({instanceId: 'ap-m1'}).blueprintSnapshot.config.height).toBe(500);

        // the same contract refuses what creation could not reach — and the component stays untouched
        const attack = accept.mutateInstance({
            instanceId: 'ap-m1',
            mutation  : {data: 'not rows'},
            registry  : CreatedInstances,
            resolveComponent
        });

        expect(attack).toMatchObject({accepted: false, stage: accept.ACCEPT_STAGES.MUTATION});
        expect(CreatedInstances.resolveTarget({instanceId: 'ap-m1'}).blueprintSnapshot.config.height).toBe(500);

        // registry/stage disagreement fails closed — MISSING component
        expect(accept.mutateInstance({instanceId: 'ap-m1', mutation: {config: {width: 300}}, registry: CreatedInstances, resolveComponent: () => null}).reason)
            .toContain('disagree');

        // registry/stage disagreement fails closed — WRONG-SHAPED component (no store the applier writes):
        // the applier throws, but the result is a bounded refusal and the registry is NOT updated
        const wrongShaped = accept.mutateInstance({
            instanceId      : 'ap-m1',
            mutation        : {config: {width: 300}},
            registry        : CreatedInstances,
            resolveComponent: () => ({}) // missing .store
        });
        expect(wrongShaped).toMatchObject({accepted: false, stage: accept.ACCEPT_STAGES.MUTATION});
        expect(wrongShaped.reason).toContain('disagree');
        // the registry still reflects the last GOOD mutation (height 500), never the failed width
        const snapshot = CreatedInstances.resolveTarget({instanceId: 'ap-m1'}).blueprintSnapshot;
        expect(snapshot.config.height).toBe(500);
        expect(snapshot.config.width).toBeUndefined();
    });

    test('accept fails closed on a duplicate id BEFORE insertion — stage and registry truth never diverge', () => {
        const stage     = createStageDouble();
        const registrar = accept.createInsertRegistrar({registry: CreatedInstances});

        stage.on('insert', registrar);

        // first accept registers cleanly
        const first = accept.acceptBlueprint({blueprint: validGrid('Dup Grid'), instanceId: 'ap-dup', stage, registry: CreatedInstances});
        expect(first.accepted).toBe(true);
        expect(stage.added).toHaveLength(1);

        // second accept with the SAME id: refused at accept-stage, and crucially NOTHING new reaches
        // the stage — the pre-registration gap (insert succeeds, registration refuses) cannot open
        const second = accept.acceptBlueprint({blueprint: validGrid('Dup Grid 2'), instanceId: 'ap-dup', stage, registry: CreatedInstances});
        expect(second).toMatchObject({accepted: false, stage: accept.ACCEPT_STAGES.ACCEPT});
        expect(second.reason).toContain('already registered');
        expect(stage.added).toHaveLength(1); // still just the first — no orphaned insert

        // the registry still holds exactly the first record, unperturbed
        expect(CreatedInstances.resolveTarget({instanceId: 'ap-dup'}).blueprintSnapshot.title).toBe('Dup Grid');
    });

    test('dispose destroys the component when resolvable and always flips the registry', () => {
        const stage     = createStageDouble();
        const registrar = accept.createInsertRegistrar({registry: CreatedInstances});

        stage.on('insert', registrar);
        accept.acceptBlueprint({blueprint: validGrid('Dispose Grid'), instanceId: 'ap-d1', stage});

        let   destroyedId = null;
        const result      = accept.disposeInstance({
            instanceId      : 'ap-d1',
            registry        : CreatedInstances,
            resolveComponent: id => ({destroy() { destroyedId = id }})
        });

        expect(result.accepted).toBe(true);
        expect(destroyedId).toBe('ap-d1-pane');
        expect(CreatedInstances.resolveTarget({instanceId: 'ap-d1'}).state).toBe('disposed');

        // disposed instances refuse mutation through the accept path too
        expect(accept.mutateInstance({instanceId: 'ap-d1', mutation: {title: 'late'}, registry: CreatedInstances, resolveComponent: () => ({})}).reason)
            .toContain('disposed');

        // double dispose refuses; unknown id refuses — staged, never thrown
        expect(accept.disposeInstance({instanceId: 'ap-d1', registry: CreatedInstances}))
            .toMatchObject({accepted: false, stage: accept.ACCEPT_STAGES.DISPOSE});
        expect(accept.disposeInstance({instanceId: 'ap-missing', registry: CreatedInstances}).accepted).toBe(false);
    });
});
