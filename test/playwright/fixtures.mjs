import { test as base, expect } from '@playwright/test';
import * as RmaHelpers from './util/RmaHelpers.mjs';
import {
    NeuralLink_ConnectionService,
    NeuralLink_InstanceService,
    NeuralLink_ComponentService,
    NeuralLink_DataService,
    NeuralLink_RuntimeService
} from '../../ai/services.mjs';

export const test = base.extend({
    neo: async ({ page }, use) => {
        // Ensure RMA helpers are registered in the browser context
        await RmaHelpers.registerRmaHelpers(page);

        const neo = {
            page,
            
            async createComponent(config) {
                return RmaHelpers.createComponent(page, config);
            },

            async destroyComponent(id) {
                return RmaHelpers.destroyComponent(page, id);
            },

            async loadModule(path) {
                return RmaHelpers.loadModule(page, path);
            },

            async setConfig(id, config) {
                return RmaHelpers.setComponentConfig(page, id, config);
            },

            async moveComponent(opts) {
                return RmaHelpers.moveComponent(page, opts);
            },
            
            async getConfig(id, keyOrKeys) {
                return RmaHelpers.getComponentConfig(page, id, keyOrKeys);
            },

            async getVdom(id) {
                return RmaHelpers.getComponentConfig(page, id, 'vdom');
            },

            /**
             * Waits for the Neo framework to be fully initialized.
             */
            async waitForReady() {
                await page.waitForFunction(() => window.Neo && window.Neo.main && window.Neo.worker.Manager.workers.app);
            },

            /**
             * Checks if a Fragment's start and end anchors exist in the DOM.
             * @param {String} id Fragment ID
             * @returns {Promise<{start: boolean, end: boolean}>}
             */
            async getFragmentAnchors(id) {
                return page.evaluate(fragmentId => {
                    const start = document.evaluate(`//comment()[contains(., ' ${fragmentId}-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    const end = document.evaluate(`//comment()[contains(., ' ${fragmentId}-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    return { start: !!start, end: !!end };
                }, id);
            }
        };

        await use(neo);
    },

    neuralLink: async ({ page }, use) => {
        // 1. Ensure Bridge connects
        await NeuralLink_ConnectionService.manageConnection({action: 'start'});

        // 2. Define the Neural Link Fixture object
        const nl = {
            /**
             * Waits for the Test's specific App Worker to connect to the Bridge and returns an SDK wrapper.
             * @param {String} [appName] Optional explicitly named app to wait for. Mostly we wait for this specific page's workerId.
             */
            async connectToApp(appName) {
                let inferredAppName = null;

                try {
                    // Give the page a moment to initialize Neo
                    await page.waitForFunction(() => window.Neo && window.Neo.config, { timeout: 2000 }).catch(() => {});
                    inferredAppName = await page.evaluate(() => {
                        const path = window.Neo?.config?.appPath;
                        return path ? path.split('/').slice(-2, -1)[0] : null;
                    });
                } catch (e) {
                    // Ignore, page might not exist or be blank
                }

                // If user passed 'Portal', prefer that, otherwise use the inferred appName like 'portal'
                const targetId = appName || inferredAppName;
                if (!targetId) {
                    throw new Error('neuralLink.connectToApp requires either an initialized Neo environment or an explicit appName to wait for.');
                }

                const sessionId = await NeuralLink_ConnectionService.waitForSession(targetId, 30000);

                return {
                    sessionId,

                    async getComponent(id, properties) {
                        const propsToFetch = properties || ['ntype', 'windowId', 'cls', 'className', 'vnode'];
                        const response = await NeuralLink_InstanceService.getInstanceProperties({ sessionId, id, properties: propsToFetch });
                        return response.properties;
                    },

                    async getStore(storeId) {
                        return NeuralLink_DataService.inspectStore({ sessionId, storeId });
                    },

                    async callMethod(id, method, args = []) {
                        const response = await NeuralLink_InstanceService.callMethod({ sessionId, id, method, args });
                        return response.result;
                    },

                    async queryComponent(selector, properties) {
                        const response = await NeuralLink_ComponentService.queryComponent({ sessionId, selector, returnProperties: properties });
                        return response.components || response;
                    },

                    async setProperties(id, properties) {
                        return NeuralLink_InstanceService.setInstanceProperties({ sessionId, id, properties });
                    }
                };
            }
        };

        await use(nl);
    }
});

export { expect };
