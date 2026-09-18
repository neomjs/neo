import {ensureDevelopmentThemeAssets} from '../../../buildScripts/util/developmentThemeAssets.mjs';
import isEntryModule                  from '../../../buildScripts/util/isEntryModule.mjs';

/**
 * @summary Ensures ordinary source-mode E2E starts only after this checkout owns a complete,
 * current development theme build. Unlike visual baselines, functional E2E may self-heal its
 * generated prerequisites before browser startup.
 * @returns {Promise<void>}
 */
export default async function globalSetup() {
    await ensureDevelopmentThemeAssets()
}

// Playwright starts `webServer` before its `globalSetup` hook. Executing this same module as the
// first web-server command step closes that ordering gap; the later hook revalidates and no-ops.
if (isEntryModule(import.meta.url)) {
    await globalSetup()
}
