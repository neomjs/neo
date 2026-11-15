import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'RealWorldApiErrorsTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import XhrConnection  from '../../../../../src/data/connection/Xhr.mjs';
import '../../../../../src/manager/Instance.mjs';

const errors  = {email: ['is invalid']},
      methods = ['delete', 'get', 'post', 'put'];

/**
 * @summary Pins that both RealWorld apps' api bases resolve a refused request with the `errors` its body names.
 *
 * `Neo.Xhr` rejects an HTTP error status. The sign-up, settings and editor views show `data.json.errors` from what
 * the api base resolves, so the base hands a refusal that names `errors` back as its result. Any other failure stays
 * a logged, empty result. Each call runs a real api base method over the real Xhr connection; only the native
 * `XMLHttpRequest` is stubbed. The api bases are created directly, not through the apps' singletons, so the shared
 * stored-token read that `ApiToken.spec.mjs` counts is restored after each test.
 */
test.describe('RealWorld api bases resolve a refused request with the errors its body names', () => {
    let answer, logs, restore;

    /**
     * @param {Number} status
     * @param {Object|String} body Sent JSON-encoded unless it is a string
     */
    const respond = (status, body) => {
        answer = {response: typeof body === 'string' ? body : JSON.stringify(body), status}
    };

    /**
     * @param {String} app The app folder
     * @returns {Promise<RealWorld.api.Base|RealWorld2.api.Base>} An api base whose stored-token read has settled
     */
    const createApi = async app => {
        const {default: Base} = await import(`../../../../../apps/${app}/api/Base.mjs`),
              keys            = ['isReady', 'token', 'tokenPromise'],
              prior           = keys.map(key => Object.getOwnPropertyDescriptor(Base, key)),
              api             = Neo.create(Base, {resource: '/users'});

        await Base.tokenPromise;

        restore.push(() => {
            api.destroy();
            keys.forEach((key, i) => prior[i] ? Object.defineProperty(Base, key, prior[i]) : delete Base[key])
        });

        return api
    };

    test.beforeEach(() => {
        const appsByName    = Neo.appsByName,
              descriptor    = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest'),
              localStorage  = Neo.ns('Neo.main.addon.LocalStorage', true),
              log           = console.log,
              read          = localStorage.readLocalStorageItem,
              xhrDescriptor = Object.getOwnPropertyDescriptor(Neo, 'Xhr');

        logs    = [];
        restore = [];

        // RealWorld's api base waits for its rendered app before it reads the stored token
        Neo.appsByName                    = {...appsByName, RealWorld: [{name: 'RealWorld', on() {}, vnodeInitialized: true}]};
        Neo.Xhr                           = Neo.create(XhrConnection, {requests: {}});
        localStorage.readLocalStorageItem = async ({key}) => ({key, value: null});
        console.log                       = (...args) => logs.push(args);

        /** @summary Answers each request with the current answer once the connection has registered its listeners. */
        globalThis.XMLHttpRequest = class AnsweringXhr {
            listeners = {}

            /** @summary Keeps the connection's listeners, so the stub can answer. */
            addEventListener(type, fn) {
                this.listeners[type] = fn
            }

            /** @summary The answer carries no headers the api reads. */
            getAllResponseHeaders() {
                return ''
            }

            /** @summary Opening has no network effect in this fixture. */
            open() {}

            /** @summary Header setup has no network effect in this fixture. */
            setRequestHeader() {}

            /** @summary Delivers the current status and body on a `load` event. */
            send() {
                const fields = answer;

                queueMicrotask(() => {
                    Object.assign(this, {readyState: 4, statusText: '', ...fields});
                    this.listeners.load({currentTarget: this, target: this})
                })
            }
        };

        restore.push(() => {
            Neo.Xhr.destroy();
            xhrDescriptor ? Object.defineProperty(Neo, 'Xhr', xhrDescriptor) : delete Neo.Xhr;
            descriptor ? Object.defineProperty(globalThis, 'XMLHttpRequest', descriptor) : delete globalThis.XMLHttpRequest;
            console.log                       = log;
            localStorage.readLocalStorageItem = read;
            Neo.appsByName                    = appsByName
        })
    });

    test.afterEach(() => {
        restore.reverse().forEach(fn => fn())
    });

    for (const app of ['realworld', 'realworld2']) {
        test(`${app}: a 422 that names errors resolves to its response, which the views read as data.json.errors`, async () => {
            const api = await createApi(app);

            respond(422, {errors});

            for (const method of methods) {
                const data = await api[method]({data: '{}'});

                expect(data?.json?.errors, `${method}()`).toEqual(errors);
                expect(data.status, `${method}()`).toBe(422)
            }
        });

        test(`${app}: any other failure is logged under its method and resolves empty`, async () => {
            const api = await createApi(app);

            respond(502, '<h1>Bad Gateway</h1>');

            for (const method of methods) {
                expect(await api[method]({data: '{}'}), `${method}()`).toBeUndefined();
                expect(logs.at(-1), `${method}()`).toEqual([`${api.className}:${method}()`, expect.objectContaining({status: 502})])
            }
        })
    }
});
