import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'RpcApiRegistrationTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Api            from '../../../../../src/manager/rpc/Api.mjs';

let serviceNames = [];

/**
 * @summary Registers a uniquely named API fixture with call, service and API defaults.
 * @param {String} suffix Per-test name, isolated from all other singleton registrations.
 * @returns {Object} Registered Users and Tasks service names.
 */
function registerMixedApi(suffix) {
    const users = `TestUnitRpcApiUsers${suffix}`,
          tasks = `TestUnitRpcApiTasks${suffix}`;

    serviceNames.push(users, tasks);
    Api.registerApi({
        url     : 'https://api.test/',
        type    : 'ajax',
        services: {
            [users]: {
                url    : 'https://users.test/',
                methods: {
                    read   : {},
                    create : {type: 'websocket'},
                    destroy: {url: 'https://x.test/'}
                },
                streams: {feed: {}}
            },
            [tasks]: {
                type   : 'websocket',
                methods: {list: {}},
                streams: {live: {type: 'sse'}}
            }
        }
    });

    return {users, tasks}
}

/**
 * @summary Registers a service without API or service-level transport defaults.
 * @param {String} suffix Per-test service suffix.
 * @returns {String} Registered service name.
 */
function registerBareApi(suffix) {
    const bare = `TestUnitRpcApiBare${suffix}`;

    serviceNames.push(bare);
    Api.registerApi({
        services: {
            [bare]: {
                methods: {ping: {}},
                streams: {tick: {}}
            }
        }
    });

    return bare
}

test.describe('Neo.manager.rpc.Api registration', () => {
    test.afterEach(() => {
        for (const item of [...Api.items]) {
            if (serviceNames.includes(item.service)) Api.unregister(item)
        }
        serviceNames = []
    });

    test('Users.read inherits the API type and service URL', () => {
        const {users} = registerMixedApi('Read');

        expect(Api.get(`${users}.read`)).toMatchObject({
            id: `${users}.read`, method: 'read', service: users, type: 'ajax', url: 'https://users.test/'
        })
    });

    test('Users.create selects the method\'s own type', () => {
        const {users} = registerMixedApi('Create');

        expect(Api.get(`${users}.create`)).toMatchObject({
            method: 'create', service: users, type: 'websocket', url: 'https://users.test/'
        })
    });

    test('Users.destroy selects the method URL over service and API URLs', () => {
        const {users} = registerMixedApi('Destroy');

        expect(Api.get(`${users}.destroy`)).toMatchObject({
            method: 'destroy', service: users, type: 'ajax', url: 'https://x.test/'
        })
    });

    test('Tasks.list inherits the service type and API URL', () => {
        const {tasks} = registerMixedApi('List');

        expect(Api.get(`${tasks}.list`)).toMatchObject({
            method: 'list', service: tasks, type: 'websocket', url: 'https://api.test/'
        })
    });

    test('Tasks.live selects the stream type and marks the entry as a stream', () => {
        const {tasks} = registerMixedApi('Live');

        expect(Api.get(`${tasks}.live`)).toMatchObject({
            method: 'live', service: tasks, type: 'sse', url: 'https://api.test/', isStream: true
        })
    });

    test('Users.feed inherits the API type before the stream default', () => {
        const {users} = registerMixedApi('Feed');

        expect(Api.get(`${users}.feed`)).toMatchObject({
            method: 'feed', service: users, type: 'ajax', url: 'https://users.test/', isStream: true
        })
    });

    test('Bare.ping defaults to ajax with no URL', () => {
        const bare  = registerBareApi('Ping'),
              entry = Api.get(`${bare}.ping`);

        expect(entry).toMatchObject({method: 'ping', service: bare, type: 'ajax'});
        expect(entry.url).toBeUndefined()
    });

    test('Bare.tick defaults to websocket with no URL', () => {
        const bare  = registerBareApi('Tick'),
              entry = Api.get(`${bare}.tick`);

        expect(entry).toMatchObject({method: 'tick', service: bare, type: 'websocket', isStream: true});
        expect(entry.url).toBeUndefined()
    });
});
