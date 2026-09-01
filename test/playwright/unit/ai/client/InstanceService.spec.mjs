import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import InstanceService from '../../../../../src/ai/client/InstanceService.mjs';

/**
 * @summary The property-read serialization contract: a Neo-instance-valued property collapses to
 * its identity snapshot, and that collapse must be MACHINE-DISTINGUISHABLE from a genuinely small
 * value — a silently-truncated deep read produces confident false negatives in exactly the
 * whitebox probes the wire exists for.
 */
test.describe.serial('Neo.ai.client.Service.safeSerialize — truncation visibility', () => {
    let service;

    test.beforeAll(() => {
        // client services are per-Client instances (Neo.create'd by Neo.ai.Client), never singletons
        service = Neo.create(InstanceService, {});
    });

    test.afterAll(() => {
        service.destroy();
    });

    test('a Neo instance collapses to its toJSON snapshot WITH the truncation marker', () => {
        const instance   = Neo.create(core.Base, {});
        const serialized = service.safeSerialize(instance);

        expect(serialized.__truncated).toBe('neo-instance-snapshot');
        // the snapshot's own identity fields survive alongside the marker
        expect(serialized.className).toBe('Neo.core.Base');
        expect(serialized.id).toBe(instance.id);

        instance.destroy();
    });

    test('a genuinely small plain object serializes in full and carries NO marker', () => {
        const serialized = service.safeSerialize({state: 'OPEN', count: 3, nested: {deep: true}});

        expect(serialized).toEqual({state: 'OPEN', count: 3, nested: {deep: true}});
        expect(serialized.__truncated).toBeUndefined();
    });

    test('instances NESTED inside objects and arrays are marked at each collapse point', () => {
        const instance   = Neo.create(core.Base, {});
        const serialized = service.safeSerialize({
            plain: 1,
            ref  : instance,
            list : [instance, {ok: true}]
        });

        expect(serialized.plain).toBe(1);
        expect(serialized.ref.__truncated).toBe('neo-instance-snapshot');
        expect(serialized.list[0].__truncated).toBe('neo-instance-snapshot');
        expect(serialized.list[1]).toEqual({ok: true});
        expect(serialized.list[1].__truncated).toBeUndefined();

        instance.destroy();
    });

    test('getInstanceProperties surfaces the marker end-to-end for an instance-valued property', () => {
        const holder = Neo.create(core.Base, {});
        const child  = Neo.create(core.Base, {});

        // an instance-valued property on a registered instance — the vnode-read shape
        holder.probeTarget = child;

        const {properties} = service.getInstanceProperties({id: holder.id, properties: ['probeTarget']});

        expect(properties.probeTarget.__truncated).toBe('neo-instance-snapshot');
        expect(properties.probeTarget.id).toBe(child.id);

        child.destroy();
        holder.destroy();
    });
});
