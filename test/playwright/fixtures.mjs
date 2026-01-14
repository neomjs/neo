import { test as base, expect } from '@playwright/test';
import * as RmaHelpers from './util/RmaHelpers.mjs';

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
    }
});

export { expect };
