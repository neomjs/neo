/**
 * Injects RMA helpers into the browser context. These helpers wrap Neo.worker.App APIs
 * so Playwright tests can create/destroy components and read/write configs via RMA.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function registerRmaHelpers(page) {
    await page.addInitScript(() => {
        window.__neoRmaHelpers = {
            async loadModule(path) {
                return Neo.worker.App.loadModule({path});
            },
            async createComponent(config) {
                return Neo.worker.App.createNeoInstance(config);
            },
            async destroyComponent(id) {
                return Neo.worker.App.destroyNeoInstance(id);
            },
            async getComponentConfig(id, keyOrKeys) {
                return Neo.worker.App.getConfigs({id, keys: keyOrKeys});
            },
            async setComponentConfig(id, config) {
                return Neo.worker.App.setConfigs({id, ...config});
            }
        };
    });
}

async function invoke(page, method, ...args) {
    return page.evaluate(([fn, params]) => {
        const helpers = window.__neoRmaHelpers;
        if (!helpers || !helpers[fn]) {
            throw new Error(`RMA helper "${fn}" is not registered. Did you call registerRmaHelpers()?`);
        }
        return helpers[fn](...params);
    }, [method, args]);
}

export async function loadModule(page, path) {
    return invoke(page, 'loadModule', path);
}

export async function createComponent(page, config) {
    return invoke(page, 'createComponent', config);
}

export async function destroyComponent(page, id) {
    return invoke(page, 'destroyComponent', id);
}

export async function getComponentConfig(page, id, keyOrKeys) {
    return invoke(page, 'getComponentConfig', id, keyOrKeys);
}

export async function setComponentConfig(page, id, config) {
    return invoke(page, 'setComponentConfig', id, config);
}
