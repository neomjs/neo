#!/usr/bin/env node
/**
 * @module buildScripts/util/theme-equality
 * @summary Headless computed-style equality runner comparing painted CSS properties across two built theme trees.
 *
 * Mounts the engine's component matrix in headless Chromium across all five themes (`neo-theme-neo-light`,
 * `neo-theme-neo-dark`, `neo-theme-light`, `neo-theme-dark`, `neo-theme-cyberpunk`) and component states
 * (`default`, `hover`, `active`, `focus`, `selected`, `pressed`, `disabled`, `invalid`, `readonly`), compares
 * resolved `getComputedStyle` values between `--base` and `--head`, and exits non-zero on any undeclared
 * difference or any declared expected difference that did not occur.
 *
 *     npm run theme-equality -- --base <base-tree> --head <head-tree>
 *     npm run theme-equality -- --base <base-tree> --head <head-tree> --expected <expected.json>
 *     npm run theme-equality -- --base <base-tree> --head <head-tree> --json
 */
import {chromium}      from '@playwright/test';
import {Command}       from 'commander';
import fs              from 'node:fs';
import http            from 'node:http';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';
import isEntryModule   from './isEntryModule.mjs';
import {
    COMPONENT_MATRIX,
    ENGINE_PACKAGE_MATRIX,
    PAINTED_PROPERTIES,
    THEMES,
    validateEnginePackageMatrix
} from './themeEqualityMatrix.mjs';

const __filename = fileURLToPath(import.meta.url),
      __dirname  = path.dirname(__filename),
      REPO_ROOT  = path.resolve(__dirname, '../..'),
      MIME_TYPES = Object.freeze({
          '.css'  : 'text/css; charset=utf-8',
          '.html' : 'text/html; charset=utf-8',
          '.js'   : 'text/javascript; charset=utf-8',
          '.json' : 'application/json; charset=utf-8',
          '.mjs'  : 'text/javascript; charset=utf-8',
          '.svg'  : 'image/svg+xml',
          '.woff2': 'font/woff2'
      });

/**
 * @summary Lists all engine `.css` relative paths inside a folder (`Global.css` first, excluding `apps/` and `examples/`).
 * @param {String} folderDir Absolute directory path (e.g. `<cssRoot>/src` or `<cssRoot>/theme-neo-light`).
 * @returns {String[]} Sorted relative paths inside `folderDir`.
 */
function listEngineCssFiles(folderDir) {
    if (!fs.existsSync(folderDir)) {
        return []
    }

    const results = [];

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, {withFileTypes: true});

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name),
                  relPath  = path.relative(folderDir, fullPath).replaceAll('\\', '/');

            if (entry.isDirectory()) {
                const topSegment = relPath.split('/')[0];

                if (topSegment === 'apps' || topSegment === 'examples') {
                    continue
                }

                walk(fullPath)
            } else if (entry.isFile() && entry.name.endsWith('.css')) {
                results.push(relPath)
            }
        }
    }

    walk(folderDir);

    results.sort((a, b) => {
        if (a === 'Global.css') return -1;
        if (b === 'Global.css') return 1;
        return a.localeCompare(b)
    });

    return results
}

/**
 * @summary Resolves a `--base` or `--head` path to its built CSS root and optional `theme-map.json` data.
 * Accepts either a repository/worktree root (`<dir>/dist/<env>/css`) or a built CSS directory (`<dir>/src`).
 * @param {String} inputPath Path to checkout root or built CSS directory.
 * @param {String} [env='development'] Build environment name when `inputPath` is a checkout root.
 * @returns {Object} Resolved `{cssRoot, themeMap, inputPath}`.
 */
export function resolveBuiltTree(inputPath, env = 'development') {
    const resolved = path.resolve(inputPath),
          asDist   = path.join(resolved, 'dist', env, 'css'),
          cssRoot  = fs.existsSync(path.join(resolved, 'src')) ? resolved
                   : fs.existsSync(path.join(asDist, 'src'))   ? asDist
                   : null;

    if (!cssRoot) {
        throw new Error(`Built CSS tree not found at "${resolved}" (expected "<path>/src" or "<path>/dist/${env}/css/src").`)
    }

    const candidateMaps = [
        path.join(resolved, 'theme-map.json'),
        path.join(path.dirname(cssRoot), 'resources', 'theme-map.json'),
        path.join(resolved, 'resources', 'theme-map.json')
    ];

    let themeMap = null;

    for (const candidate of candidateMaps) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            themeMap = JSON.parse(fs.readFileSync(candidate, 'utf8'));
            break
        }
    }

    return {cssRoot, inputPath: resolved, themeMap}
}

/**
 * @summary Resolves the ordered list of built CSS URLs (`/__equality_css/...`) to mount for one theme in a built tree.
 * Loads `src`, `theme-base` (when present), and the folders mapped for `themeClass` (`themeMap.themes[themeClass]`
 * or `themeClass.slice(4)` fallback).
 * @param {Object} tree Resolved tree from `resolveBuiltTree`.
 * @param {String} themeClass Theme class name (e.g. `'neo-theme-neo-light'`).
 * @returns {String[]} Ordered URL paths under `/__equality_css/`.
 */
export function collectThemeStylesheetUrls(tree, themeClass) {
    const mappedFolders = Array.isArray(tree.themeMap?.themes?.[themeClass])
            ? tree.themeMap.themes[themeClass]
            : [themeClass.startsWith('neo-') ? themeClass.slice(4) : themeClass],
          folders       = ['src'],
          urls          = [],
          seenFolders   = new Set(['src']);

    if (fs.existsSync(path.join(tree.cssRoot, 'theme-base'))) {
        folders.push('theme-base');
        seenFolders.add('theme-base')
    }

    for (const folder of mappedFolders) {
        if (folder && !seenFolders.has(folder) && fs.existsSync(path.join(tree.cssRoot, folder))) {
            folders.push(folder);
            seenFolders.add(folder)
        }
    }

    for (const folder of folders) {
        const files = listEngineCssFiles(path.join(tree.cssRoot, folder));

        for (const relFile of files) {
            urls.push(`/__equality_css/${folder}/${relFile}`)
        }
    }

    return urls
}

/**
 * @summary Compares two captured style snapshots and returns sorted property differences.
 * Each component entry can sample multiple DOM parts; differences are reported per `(component, theme, state, property)`
 * (using the first differing part in declared order so each painted property change on a component emits one clean row).
 * @param {Object} baseSnapshot Snapshot map `{[component]: {[theme]: {[state]: {[part]: {[property]: value}}}}}`.
 * @param {Object} headSnapshot Snapshot map with the same shape.
 * @returns {Object} Comparison summary `{diffs, totalComparisons}`.
 */
export function compareSnapshots(baseSnapshot, headSnapshot) {
    const diffs      = [],
          components = Array.from(new Set([...Object.keys(baseSnapshot), ...Object.keys(headSnapshot)])).sort();

    let totalComparisons = 0;

    for (const component of components) {
        const baseThemes = baseSnapshot[component] || {},
              headThemes = headSnapshot[component] || {},
              themes     = Array.from(new Set([...Object.keys(baseThemes), ...Object.keys(headThemes)]));

        for (const theme of themes) {
            const baseStates = baseThemes[theme] || {},
                  headStates = headThemes[theme] || {},
                  states     = Array.from(new Set([...Object.keys(baseStates), ...Object.keys(headStates)]));

            for (const state of states) {
                const baseParts = baseStates[state] || {},
                      headParts = headStates[state] || {},
                      partKeys  = Array.from(new Set([...Object.keys(baseParts), ...Object.keys(headParts)]));

                for (const property of PAINTED_PROPERTIES) {
                    totalComparisons++;

                    for (const part of partKeys) {
                        const baseVal = baseParts[part]?.[property] ?? '<missing>',
                              headVal = headParts[part]?.[property] ?? '<missing>';

                        if (baseVal !== headVal) {
                            diffs.push({
                                component,
                                theme,
                                state,
                                property,
                                part,
                                base: baseVal,
                                head: headVal
                            });
                            break
                        }
                    }
                }
            }
        }
    }

    return {diffs, totalComparisons}
}

/**
 * @summary Checks whether an observed difference matches a declared expected-difference rule.
 * Wildcard `'*'` or omitted optional fields (`theme`, `state`, `property`, `base`, `head`) match any value;
 * `component` is required on every expected rule.
 * @param {Object} diff Observed difference row.
 * @param {Object} rule Expected rule `{component, theme?, state?, property?, base?, head?}`.
 * @returns {Boolean}
 */
function matchesExpectedRule(diff, rule) {
    for (const field of ['component', 'theme', 'state', 'property', 'base', 'head']) {
        const expected = rule[field];

        if (expected !== undefined && expected !== '*' && expected !== diff[field]) {
            return false
        }
    }

    return true
}

/**
 * @summary Evaluates observed differences against declared expected-difference rules.
 * Declared differences pass; undeclared differences fail; declared rules that never occurred also fail.
 * @param {Object[]} diffs Observed differences from `compareSnapshots`.
 * @param {Object[]} [expectedRules=[]] Expected difference rules.
 * @returns {Object} Verdict `{ok, unexpectedDiffs, matchedDiffs, unmetExpected}`.
 */
export function evaluateExpectedDiffs(diffs, expectedRules = []) {
    const matchedRuleIndexes = new Set(),
          unexpectedDiffs    = [],
          matchedDiffs       = [];

    for (const diff of diffs) {
        let matched = false;

        expectedRules.forEach((rule, index) => {
            if (matchesExpectedRule(diff, rule)) {
                matched = true;
                matchedRuleIndexes.add(index)
            }
        });

        if (matched) {
            matchedDiffs.push(diff)
        } else {
            unexpectedDiffs.push(diff)
        }
    }

    const unmetExpected = expectedRules.filter((_, index) => !matchedRuleIndexes.has(index));

    return {
        ok: unexpectedDiffs.length === 0 && unmetExpected.length === 0,
        unexpectedDiffs,
        matchedDiffs,
        unmetExpected
    }
}

/**
 * @summary Formats the equality run result as a Markdown report with diff and unmet-expected tables.
 * @param {Object} result Run output from `runThemeEquality`.
 * @returns {String} Markdown report.
 */
export function formatEqualityReport(result) {
    const lines = [
        `# Theme Computed-Style Equality Report`,
        ``,
        `- **Status:** ${result.ok ? 'PASS' : 'FAIL'}`,
        `- **Elapsed:** ${(result.elapsedMs / 1000).toFixed(2)}s`,
        `- **Themes:** ${result.themes.join(', ')}`,
        `- **Components probed:** ${result.componentCount} across ${result.packageCoverage.diskPackages.length} engine packages`,
        `- **Property comparisons:** ${result.totalComparisons}`,
        `- **Undeclared differences:** ${result.unexpectedDiffs.length}`,
        `- **Declared differences matched:** ${result.matchedDiffs.length}`,
        `- **Declared differences unmet:** ${result.unmetExpected.length}`
    ];

    if (result.diffs.length > 0) {
        lines.push(
            ``,
            `## Differences`,
            ``,
            `| Component | Theme | State | Property | Base | Head | Disposition |`,
            `|---|---|---|---|---|---|---|`
        );

        const unexpectedSet = new Set(result.unexpectedDiffs);

        for (const diff of result.diffs) {
            const disposition = unexpectedSet.has(diff) ? 'undeclared' : 'expected';
            lines.push(`| \`${diff.component}\` | \`${diff.theme}\` | \`${diff.state}\` | \`${diff.property}\` | \`${diff.base}\` | \`${diff.head}\` | ${disposition} |`)
        }
    }

    if (result.unmetExpected.length > 0) {
        lines.push(
            ``,
            `## Unmet Expected Differences`,
            ``,
            `| Component | Theme | State | Property |`,
            `|---|---|---|---|`
        );

        for (const rule of result.unmetExpected) {
            lines.push(`| \`${rule.component ?? '*'}\` | \`${rule.theme ?? '*'}\` | \`${rule.state ?? '*'}\` | \`${rule.property ?? '*'}\` |`)
        }
    }

    return lines.join('\n')
}

/**
 * @summary Starts a local HTTP static server serving the repository root plus `/__equality_css/**` from the active tree.
 * @param {String} repoRoot Workspace root path.
 * @param {Function} getActiveTree Callback returning the currently active resolved tree.
 * @returns {Promise<Object>} Server handle `{port, close}`.
 */
function startEqualityServer(repoRoot, getActiveTree) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlObj   = new URL(req.url || '/', 'http://127.0.0.1'),
                  pathname = decodeURIComponent(urlObj.pathname),
                  tree     = getActiveTree();

            if (pathname === '/resources/theme-map.json' || pathname.endsWith('/resources/theme-map.json')) {
                res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
                res.end(JSON.stringify(tree?.themeMap || {}));
                return
            }

            let filePath;

            if (pathname.startsWith('/__equality_css/')) {
                const relCss = pathname.slice('/__equality_css/'.length),
                      target = path.resolve(tree.cssRoot, relCss);

                if (!target.startsWith(tree.cssRoot + path.sep)) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return
                }

                filePath = target
            } else {
                const relRepo = pathname.replace(/^\/+/, ''),
                      target  = path.resolve(repoRoot, relRepo);

                if (target !== repoRoot && !target.startsWith(repoRoot + path.sep)) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return
                }

                filePath = target
            }

            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                res.writeHead(404);
                res.end('Not found');
                return
            }

            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type' : MIME_TYPES[ext] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            res.end(fs.readFileSync(filePath))
        });

        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            resolve({
                port : addr.port,
                close: () => new Promise(done => server.close(() => done()))
            })
        })
    })
}

/**
 * @summary Captures computed styles for every entry in `COMPONENT_MATRIX` across `themes` and `states` for one built tree.
 * @param {Object} page Playwright Page instance.
 * @param {Number} port Local server port.
 * @param {Object} tree Resolved built tree.
 * @param {String[]} themes Theme class names to evaluate.
 * @returns {Promise<Object>} Captured snapshot map.
 */
async function captureTreeSnapshot(page, port, tree, themes) {
    await page.goto(`http://127.0.0.1:${port}/test/playwright/component/apps/theme-equality/index.html`, {
        waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('#theme-equality-viewport[data-ready="true"]', {timeout: 30000});

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');

    const missingSelectors = await page.evaluate(entries => {
        let freeze = document.getElementById('neo-theme-equality-freeze');

        if (!freeze) {
            freeze = document.createElement('style');
            freeze.id = 'neo-theme-equality-freeze';
            freeze.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
            document.head.appendChild(freeze)
        }

        const missing = [];

        for (const entry of entries) {
            const cell = document.getElementById(`eq-cell-${entry.cellId}`);

            if (!cell) {
                missing.push(`${entry.id}: missing cell #eq-cell-${entry.cellId}`);
                continue
            }

            const stateTarget = cell.querySelector(entry.stateTargetSelector),
                  focusTarget = entry.inputSelector ? cell.querySelector(entry.inputSelector) : stateTarget;

            if (!stateTarget) {
                missing.push(`${entry.id}: missing stateTargetSelector "${entry.stateTargetSelector}"`)
            } else {
                stateTarget.setAttribute('data-eq-target-id', entry.id)
            }

            if (!focusTarget) {
                missing.push(`${entry.id}: missing inputSelector "${entry.inputSelector}"`)
            } else {
                focusTarget.setAttribute('data-eq-focus-id', entry.id)
            }

            for (const partSelector of entry.parts) {
                if (!cell.querySelector(partSelector)) {
                    missing.push(`${entry.id}: missing part "${partSelector}"`)
                }
            }
        }

        return missing
    }, COMPONENT_MATRIX);

    if (missingSelectors.length > 0) {
        throw new Error(`Unmatched DOM selectors in theme-equality stage:\n- ${missingSelectors.join('\n- ')}`)
    }

    const {root}        = await cdp.send('DOM.getDocument', {depth: -1}),
          targetNodeIds = {},
          focusNodeIds  = {};

    await Promise.all(COMPONENT_MATRIX.map(async entry => {
        const safeId = entry.id.replaceAll('"', '\\"');

        if (entry.states.includes('hover') || entry.states.includes('active')) {
            const {nodeId} = await cdp.send('DOM.querySelector', {
                nodeId  : root.nodeId,
                selector: `[data-eq-target-id="${safeId}"]`
            });
            if (nodeId) targetNodeIds[entry.id] = nodeId
        }

        if (entry.states.includes('focus')) {
            const {nodeId} = await cdp.send('DOM.querySelector', {
                nodeId  : root.nodeId,
                selector: `[data-eq-focus-id="${safeId}"]`
            });
            if (nodeId) focusNodeIds[entry.id] = nodeId
        }
    }));

    const snapshot      = {},
          hoverEntries  = COMPONENT_MATRIX.filter(e => e.states.includes('hover')),
          activeEntries = COMPONENT_MATRIX.filter(e => e.states.includes('active')),
          focusEntries  = COMPONENT_MATRIX.filter(e => e.states.includes('focus')),
          DOM_STATES    = ['default', 'selected', 'pressed', 'disabled', 'invalid', 'readonly'];

    for (const entry of COMPONENT_MATRIX) {
        snapshot[entry.id] = {}
    }

    for (const theme of themes) {
        const urls = collectThemeStylesheetUrls(tree, theme);

        for (const entry of COMPONENT_MATRIX) {
            snapshot[entry.id][theme] = {}
        }

        const domBatch = await page.evaluate(async ({themeClass, sheetUrls, allThemes, entries, domStates, props}) => {
            const viewport = document.getElementById('theme-equality-viewport');

            for (const t of allThemes) {
                document.body.classList.remove(t);
                viewport?.classList.remove(t)
            }

            document.body.classList.add(themeClass);
            viewport?.classList.add(themeClass);

            const existing = [...document.querySelectorAll('link[data-equality-sheet="true"]')];
            const loaded   = await Promise.all(sheetUrls.map(href => new Promise((resolve, reject) => {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `${href}?t=${encodeURIComponent(themeClass)}`;
                link.dataset.equalitySheet = 'true';
                link.onload = () => resolve(link);
                link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
                document.head.appendChild(link)
            })));

            existing.forEach(link => link.remove());
            void loaded;

            const scheme = getComputedStyle(document.body).getPropertyValue('--neo-color-scheme').trim();
            document.documentElement.style.colorScheme = scheme === 'dark' || scheme === 'light' ? scheme : '';

            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            const readParts = (cell, partSelectors) => {
                const partValues = {};
                for (const selector of partSelectors) {
                    const partEl = cell?.querySelector(selector);
                    if (!partEl) continue;
                    const computed = getComputedStyle(partEl),
                          values   = {};
                    for (const prop of props) {
                        values[prop] = computed.getPropertyValue(prop).trim()
                    }
                    partValues[selector] = values
                }
                return partValues
            };

            const batchOut = {};

            for (const entry of entries) {
                const cell   = document.getElementById(`eq-cell-${entry.cellId}`),
                      target = cell?.querySelector(entry.stateTargetSelector),
                      input  = entry.inputSelector ? cell?.querySelector(entry.inputSelector) : null;

                batchOut[entry.id] = {};

                for (const stateName of domStates) {
                    if (!entry.states.includes(stateName)) continue;

                    const undo     = [];
                    const addClass = (el, cls) => {
                        if (el && !el.classList.contains(cls)) {
                            el.classList.add(cls);
                            undo.push(() => el.classList.remove(cls))
                        }
                    };
                    const setAttr = (el, name, val) => {
                        if (!el) return;
                        const had  = el.hasAttribute(name),
                              prev = el.getAttribute(name);
                        el.setAttribute(name, val);
                        undo.push(() => had ? el.setAttribute(name, prev) : el.removeAttribute(name))
                    };

                    if (target) {
                        if (stateName === 'selected') {
                            addClass(target, 'neo-selected');
                            setAttr(target, 'aria-selected', 'true')
                        } else if (stateName === 'pressed') {
                            addClass(target, 'pressed');
                            setAttr(target, 'aria-pressed', 'true')
                        } else if (stateName === 'disabled') {
                            addClass(target, 'neo-disabled');
                            setAttr(target, 'disabled', '');
                            if (input) setAttr(input, 'disabled', '')
                        } else if (stateName === 'invalid') {
                            addClass(target, 'neo-invalid');
                            setAttr(target, 'aria-invalid', 'true')
                        } else if (stateName === 'readonly') {
                            addClass(target, 'neo-readonly');
                            setAttr(target, 'readonly', '');
                            if (input) setAttr(input, 'readonly', '')
                        }
                    }

                    batchOut[entry.id][stateName] = readParts(cell, entry.parts);

                    for (let i = undo.length - 1; i >= 0; i--) {
                        undo[i]()
                    }
                }
            }

            return batchOut
        }, {
            themeClass: theme,
            sheetUrls : urls,
            allThemes : THEMES,
            entries   : COMPONENT_MATRIX,
            domStates : DOM_STATES,
            props     : PAINTED_PROPERTIES
        });

        for (const [entryId, stateMap] of Object.entries(domBatch)) {
            Object.assign(snapshot[entryId][theme], stateMap)
        }

        const runPseudoBatch = async (stateName, entries, nodeMap, forcedPseudoClasses, extraClasses) => {
            const activeNodes = entries.map(e => nodeMap[e.id]).filter(Boolean);

            await Promise.all(activeNodes.map(nodeId =>
                cdp.send('CSS.forcePseudoState', {nodeId, forcedPseudoClasses})
            ));

            const results = await page.evaluate(({subset, extraCls, props}) => {
                const out  = {},
                      undo = [];

                for (const entry of subset) {
                    const cell   = document.getElementById(`eq-cell-${entry.cellId}`),
                          target = cell?.querySelector(entry.stateTargetSelector);

                    if (target) {
                        for (const cls of extraCls) {
                            if (!target.classList.contains(cls)) {
                                target.classList.add(cls);
                                undo.push(() => target.classList.remove(cls))
                            }
                        }
                    }
                }

                for (const entry of subset) {
                    const cell       = document.getElementById(`eq-cell-${entry.cellId}`),
                          partValues = {};

                    for (const selector of entry.parts) {
                        const partEl = cell?.querySelector(selector);
                        if (!partEl) continue;
                        const computed = getComputedStyle(partEl),
                              values   = {};
                        for (const prop of props) {
                            values[prop] = computed.getPropertyValue(prop).trim()
                        }
                        partValues[selector] = values
                    }

                    out[entry.id] = partValues
                }

                for (let i = undo.length - 1; i >= 0; i--) {
                    undo[i]()
                }

                return out
            }, {subset: entries, extraCls: extraClasses, props: PAINTED_PROPERTIES});

            await Promise.all(activeNodes.map(nodeId =>
                cdp.send('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: []})
            ));

            for (const [entryId, partValues] of Object.entries(results)) {
                snapshot[entryId][theme][stateName] = partValues
            }
        };

        await runPseudoBatch('hover', hoverEntries, targetNodeIds, ['hover'], ['neo-hovered']);
        await runPseudoBatch('active', activeEntries, targetNodeIds, ['active'], []);
        await runPseudoBatch('focus', focusEntries, focusNodeIds, ['focus', 'focus-visible', 'focus-within'], ['neo-focus', 'neo-focus-keyboard'])
    }

    await cdp.detach();
    return snapshot
}

/**
 * @summary Executes a full headless computed-style equality comparison between two built trees.
 * @param {Object} options Run configuration `{base, head, env?, expected?, themes?, repoRoot?}`.
 * @returns {Promise<Object>} Full comparison result and verdict.
 */
export async function runThemeEquality(options) {
    const startMs         = performance.now(),
          repoRoot        = options.repoRoot ? path.resolve(options.repoRoot) : REPO_ROOT,
          env             = options.env || 'development',
          themes          = options.themes?.length ? options.themes : [...THEMES],
          expectedRules   = options.expected || [],
          packageCoverage = validateEnginePackageMatrix(path.join(repoRoot, 'resources/css/src'));

    if (!packageCoverage.ok) {
        throw new Error(`Engine package matrix is incomplete: ${JSON.stringify(packageCoverage)}`)
    }

    const baseTree = resolveBuiltTree(options.base, env),
          headTree = resolveBuiltTree(options.head, env);

    let activeTree = baseTree;

    const server  = await startEqualityServer(repoRoot, () => activeTree),
          browser = await chromium.launch({headless: true});

    try {
        const context = await browser.newContext({viewport: {width: 1440, height: 900}});

        await context.addInitScript(() => {
            const FIXED_MS = Date.UTC(2024, 6, 21, 12, 0, 0, 0),
                  RealDate = Date;

            class FixedDate extends RealDate {
                constructor(...args) {
                    super(...(args.length === 0 ? [FIXED_MS] : args))
                }

                static now() {
                    return FIXED_MS
                }
            }

            globalThis.Date = FixedDate
        });

        const page = await context.newPage();

        activeTree = baseTree;
        const baseSnapshot = await captureTreeSnapshot(page, server.port, baseTree, themes);

        activeTree = headTree;
        const headSnapshot = await captureTreeSnapshot(page, server.port, headTree, themes);

        await context.close();

        const {diffs, totalComparisons} = compareSnapshots(baseSnapshot, headSnapshot),
              verdict                   = evaluateExpectedDiffs(diffs, expectedRules),
              elapsedMs                 = Math.round(performance.now() - startMs);

        return {
            ok             : verdict.ok,
            elapsedMs,
            themes,
            componentCount : COMPONENT_MATRIX.length,
            packageMatrix  : ENGINE_PACKAGE_MATRIX,
            packageCoverage,
            totalComparisons,
            diffs,
            unexpectedDiffs: verdict.unexpectedDiffs,
            matchedDiffs   : verdict.matchedDiffs,
            unmetExpected  : verdict.unmetExpected
        }
    } finally {
        await browser.close();
        await server.close()
    }
}

/**
 * @summary CLI entrypoint for `npm run theme-equality`.
 * @param {String[]} [argv=process.argv] Process arguments.
 * @returns {Promise<Number>} Process exit code (`0` on pass, `1` on undeclared/unmet diff or error).
 */
export async function main(argv = process.argv) {
    const program = new Command();

    program
        .name('theme-equality')
        .description('Compare computed painted styles across themes and states between two built CSS trees.')
        .requiredOption('-b, --base <path>', 'Base built CSS folder or checkout root')
        .option('-h, --head <path>', 'Head built CSS folder or checkout root', path.join(REPO_ROOT, 'dist/development/css'))
        .option('-e, --env <env>', 'Build environment when --base/--head points to a checkout root', 'development')
        .option('-x, --expected <file>', 'JSON file listing expected difference rules')
        .option('-t, --themes <list>', 'Comma-separated theme class names to compare')
        .option('--json', 'Output JSON instead of Markdown');

    program.parse(argv);
    const opts = program.opts();

    const expected = opts.expected
        ? JSON.parse(fs.readFileSync(path.resolve(opts.expected), 'utf8'))
        : [];

    const themes = opts.themes
        ? opts.themes.split(',').map(s => s.trim()).filter(Boolean)
        : [...THEMES];

    const result = await runThemeEquality({
        base: opts.base,
        head: opts.head,
        env : opts.env,
        expected,
        themes
    });

    if (opts.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
        process.stdout.write(`${formatEqualityReport(result)}\n`)
    }

    return result.ok ? 0 : 1
}

if (isEntryModule(import.meta.url)) {
    main().then(
        code => { process.exitCode = code },
        err  => {
            process.stderr.write(`${err?.stack || err}\n`);
            process.exitCode = 1
        }
    )
}
