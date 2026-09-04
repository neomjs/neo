import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'ClientResolveServiceMethodTest'
    }
});

import {test, expect}                                          from '@playwright/test';
import Neo                                                     from '../../../../../src/Neo.mjs';
import * as core                                               from '../../../../../src/core/_export.mjs';
import ComponentService,   {registerComponentServiceMethods}   from '../../../../../src/ai/client/ComponentService.mjs';
import DataService,        {registerDataServiceMethods}        from '../../../../../src/ai/client/DataService.mjs';
import DockService,        {registerDockServiceMethods}        from '../../../../../src/ai/client/DockService.mjs';
import InstanceService,    {registerInstanceServiceMethods}    from '../../../../../src/ai/client/InstanceService.mjs';
import InteractionService, {registerInteractionServiceMethods} from '../../../../../src/ai/client/InteractionService.mjs';
import RuntimeService,     {registerRuntimeServiceMethods}     from '../../../../../src/ai/client/RuntimeService.mjs';
import {resolveServiceMethod}                                  from '../../../../../src/ai/client/resolveServiceMethod.mjs';

/**
 * The wire names this client answers: one per call the Brain's Neural Link services send for an
 * advertised tool, read from those services when the list was last synced. A name the Brain starts
 * sending is added here and gets a handler on the service that owns its prefix.
 */
const WIRE_METHODS = [
    'abort_transaction', 'begin_transaction', 'call_method', 'capture_perspective', 'check_namespace',
    'close_window', 'commit_transaction', 'create_instance', 'diff_dock_topology', 'execute_dock_operation',
    'find_instances', 'focus_window', 'get_component_tree', 'get_computed_styles', 'get_dock_topology',
    'get_dom_event_listeners', 'get_dom_event_summary', 'get_dom_rect', 'get_drag_state', 'get_drag_trace',
    'get_instance_properties', 'get_method_source', 'get_namespace_tree', 'get_neo_config', 'get_record',
    'get_route_history', 'get_vdom_tree', 'get_vdom_vnode', 'get_vnode_tree', 'highlight_component',
    'inspect_class', 'inspect_state_provider', 'inspect_store', 'list_perspectives', 'list_stores',
    'list_transactions', 'modify_state_provider', 'observe_motion', 'open_component_window', 'patch_code',
    'position_window', 'query_component', 'query_vdom', 'redo', 'reload_page', 'replay_transaction',
    'restore_perspective', 'save_transaction', 'set_instance_properties', 'set_neo_config', 'set_route',
    'simulate_event', 'undo', 'verify_component_consistency'
];

test.describe('Neo.ai.client.resolveServiceMethod', () => {
    let services, serviceMap;

    /**
     * @param {String} method
     * @param {Object} service
     * @param {Function} fn
     */
    function expectTarget(method, service, fn) {
        const target = resolveServiceMethod(serviceMap, method);

        expect(target?.service).toBe(service);
        expect(target?.fn).toBe(fn)
    }

    test.beforeAll(() => {
        services = {
            component  : Neo.create(ComponentService),
            data       : Neo.create(DataService),
            dock       : Neo.create(DockService),
            instance   : Neo.create(InstanceService),
            interaction: Neo.create(InteractionService),
            runtime    : Neo.create(RuntimeService)
        };

        // The Client's registration order, which is the prefix precedence.
        serviceMap = {};

        registerComponentServiceMethods(serviceMap, services.component);
        registerDockServiceMethods(serviceMap, services.dock);
        registerInstanceServiceMethods(serviceMap, services.instance);
        registerDataServiceMethods(serviceMap, services.data);
        registerRuntimeServiceMethods(serviceMap, services.runtime);
        registerInteractionServiceMethods(serviceMap, services.interaction)
    });

    test.afterAll(() => {
        Object.values(services).forEach(service => service.destroy())
    });

    test('every wire method resolves to a handler on a registered service', () => {
        const unresolved = WIRE_METHODS.filter(method => !resolveServiceMethod(serviceMap, method));

        expect(unresolved).toEqual([])
    });

    test('a family prefix answers each member with the full camelCase handler', () => {
        const {runtime} = services;

        expectTarget('get_dom_event_listeners', runtime, runtime.getDomEventListeners);
        expectTarget('get_dom_event_summary',   runtime, runtime.getDomEventSummary);
        expectTarget('set_neo_config',          runtime, runtime.setNeoConfig)
    });

    test('the first registered prefix wins, in registration order', () => {
        const
            first  = {getABC() {}},
            second = {getABC() {}},
            target = resolveServiceMethod({get_a: first, get_a_b: second}, 'get_a_b_c');

        expect(target.service).toBe(first);
        expect(target.fn).toBe(first.getABC)
    });

    test('an unregistered prefix, or a prefix without that handler, resolves to nothing', () => {
        expect(resolveServiceMethod(serviceMap, 'teleport_component')).toBeNull();
        expect(resolveServiceMethod(serviceMap, 'get_vdom_nope')).toBeNull()
    });
});
