import {access}        from 'node:fs/promises';
import {spawn}         from 'node:child_process';
import fs              from 'node:fs';
import {fileURLToPath} from 'node:url';
import path            from 'node:path';

import {newestMtime} from '../buildScripts/util/developmentThemeAssets.mjs';

const
    harnessDir = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot   = path.resolve(harnessDir, '..'),
    assets     = {
        dark       : 'dist/development/css/theme-neo-dark/Global.css',
        fontAwesome: 'node_modules/@fortawesome/fontawesome-free/css/all.min.css',
        light      : 'dist/development/css/theme-neo-light/Global.css',
        logo       : 'resources/images/logo/neo_logo_primary.svg',
        map        : 'resources/theme-map.json',
        source     : 'dist/development/css/src/Global.css'
    };

/**
 * @summary Returns whether a generated harness asset exists in the repo checkout.
 * @param {String} relativePath
 * @returns {Promise<Boolean>}
 */
async function assetExists(relativePath) {
    try {
        await access(path.join(repoRoot, relativePath));
        return true
    } catch {
        return false
    }
}

/**
 * @summary Runs the canonical Neo theme builder for one development theme.
 * @param {String} theme
 * @returns {Promise<void>}
 */
function buildTheme(theme) {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    return new Promise((resolve, reject) => {
        const child = spawn(
            npmCommand,
            ['run', 'build-themes', '--', '-n', '-e', 'dev', '-t', theme],
            {cwd: repoRoot, stdio: 'inherit'}
        );

        child.on('error', reject);
        child.on('exit', code => {
            code === 0 ? resolve() : reject(new Error(`Theme build failed for ${theme} with exit code ${code}`))
        })
    })
}

/**
 * @summary True when any SCSS source is newer than the built theme css — the exact failure the
 * harness cannot see otherwise: a merged theming change leaves EXISTING but WRONG css on disk,
 * and the window renders fully broken while every existence probe stays green.
 * @returns {Boolean}
 */
function themesAreStale() {
    const newestScss = newestMtime(path.join(repoRoot, 'resources', 'scss'), '.scss');

    return [assets.dark, assets.light, assets.source].some(asset => {
        try {
            return fs.statSync(path.join(repoRoot, asset)).mtimeMs < newestScss
        } catch {
            return true
        }
    })
}

/**
 * @summary Materializes the generated assets the source-mode Agent OS boot requires — and
 * REBUILDS the themes when any SCSS source is newer than the built css (staleness, not just
 * existence: the fully-broken-visuals class ships through existence-only checks).
 * @returns {Promise<void>}
 */
async function prepareAssets() {
    const state = Object.fromEntries(
        await Promise.all(Object.entries(assets).map(async ([key, value]) => [key, await assetExists(value)]))
    );

    if (Object.values(state).every(Boolean) && !themesAreStale()) {
        return
    }

    if (Object.values(state).every(Boolean)) {
        console.log('[harness] built themes are older than the SCSS sources — rebuilding');
        for (const theme of ['theme-neo-dark', 'theme-neo-light']) {
            await buildTheme(theme)
        }
        return
    }

    if (!state.fontAwesome) {
        throw new Error('Harness source mode requires the repo-root dependencies; run npm install from the repo root')
    }

    const themes = !state.source || !state.map ? ['theme-neo-dark', 'theme-neo-light'] : [
        !state.dark  && 'theme-neo-dark',
        !state.light && 'theme-neo-light'
    ].filter(Boolean);

    for (const theme of themes) {
        await buildTheme(theme)
    }

    const missing = (await Promise.all(
        Object.values(assets).map(async asset => [asset, await assetExists(asset)])
    )).filter(([, exists]) => !exists).map(([asset]) => asset);

    if (missing.length > 0) {
        throw new Error(`Harness asset preparation incomplete: ${missing.join(', ')}`)
    }
}

await prepareAssets();
