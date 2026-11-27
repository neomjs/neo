#!/usr/bin/env node
/**
 * @module buildScripts/util/theme-equality
 * @summary Headless computed-style equality runner comparing painted CSS properties across two built theme trees.
 *
 * Mounts the engine's component matrix in headless Chromium across all five themes (`neo-theme-neo-light`,
 * `neo-theme-neo-dark`, `neo-theme-light`, `neo-theme-dark`, `neo-theme-cyberpunk`), both theme-scope passes
 * (`inherited`, `scoped`), and component states (`default`, `hover`, `active`, `focus`, `selected`, `pressed`,
 * `disabled`, `invalid`, `readonly`), compares resolved `getComputedStyle` values (including `::before` and
 * `::after` pseudo-elements) per part between `--base` and `--head`, and exits non-zero on any undeclared
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
    normalizePartSpec,
    PAINTED_PROPERTIES,
    SCOPES,
    THEMES,
    validateEnginePackageMatrix
} from './themeEqualityMatrix.mjs';

const __filename        = fileURLToPath(import.meta.url),
      __dirname         = path.dirname(__filename),
      REPO_ROOT         = path.resolve(__dirname, '../..'),
      ALLOWED_RULE_KEYS = new Set(['component', 'theme', 'scope', 'state', 'part', 'property', 'base', 'head', 'reason']),
      MATCHED_RULE_KEYS = ['component', 'theme', 'scope', 'state', 'part', 'property', 'base', 'head'],
      MIME_TYPES        = Object.freeze({
          '.css'  : 'text/css; charset=utf-8',
          '.html' : 'text/html; charset=utf-8',
          '.js'   : 'text/javascript; charset=utf-8',
          '.json' : 'application/json; charset=utf-8',
          '.mjs'  : 'text/javascript; charset=utf-8',
          '.svg'  : 'image/svg+xml',
          '.woff2': 'font/woff2'
      });

/**
 * @summary Checks whether `dir` is a built CSS root containing structural `src/Global.css`.
 * Distinguishes a built CSS tree from a checkout root whose `<root>/src` contains JavaScript `.mjs` sources.
 * @param {String} dir Candidate CSS root directory.
 * @returns {Boolean}
 */
function hasBuiltStructuralCss(dir) {
    const globalCss = path.join(dir, 'src', 'Global.css');

    return fs.existsSync(globalCss) && fs.statSync(globalCss).isFile()
}

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
 * Prefers `<dir>/dist/<env>/css` when `inputPath` is a repository or worktree root (whose `<dir>/src` holds
 * JavaScript sources), while retaining direct CSS-root support (`<dir>/src/Global.css`).
 * @param {String} inputPath Path to checkout/worktree root or built CSS directory.
 * @param {String} [env='development'] Build environment name when `inputPath` is a checkout root.
 * @returns {Object} Resolved `{cssRoot, themeMap, inputPath}`.
 */
export function resolveBuiltTree(inputPath, env = 'development') {
    if (typeof inputPath !== 'string' || !inputPath.trim()) {
        throw new Error('A non-empty --base / --head path is required.')
    }

    const resolved = path.resolve(inputPath),
          asDist   = path.join(resolved, 'dist', env, 'css'),
          cssRoot  = hasBuiltStructuralCss(asDist)   ? asDist
                   : hasBuiltStructuralCss(resolved) ? resolved
                   : null;

    if (!cssRoot) {
        throw new Error(
            `Built CSS tree missing structural "src/Global.css" at "${resolved}" ` +
            `(checked "${asDist}" and "${resolved}"). Run "npm run build-themes -- -n -e dev -t all" first.`
        )
    }

    const candidateMaps = [
        path.join(cssRoot, 'theme-map.json'),
        path.join(resolved, 'theme-map.json'),
        path.join(resolved, 'resources', 'theme-map.json'),
        path.join(path.dirname(cssRoot), 'resources', 'theme-map.json'),
        path.join(path.resolve(cssRoot, '../../..'), 'resources', 'theme-map.json')
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
 * @summary Resolves and validates the ordered list of built CSS URLs (`/__equality_css/...`) to mount for one theme.
 * Fails closed when structural CSS (`src/Global.css`) is missing or when a requested theme resolves zero theme sheets.
 * @param {Object} tree Resolved tree from `resolveBuiltTree`.
 * @param {String} themeClass Theme class name (e.g. `'neo-theme-neo-light'`).
 * @returns {String[]} Ordered URL paths under `/__equality_css/`.
 */
export function collectThemeStylesheetUrls(tree, themeClass) {
    if (typeof themeClass !== 'string' || !themeClass.trim()) {
        throw new Error('Theme class name must be a non-empty string.')
    }

    const srcFiles = listEngineCssFiles(path.join(tree.cssRoot, 'src'));

    if (!srcFiles.includes('Global.css')) {
        throw new Error(`Missing built structural "src/Global.css" in "${tree.cssRoot}".`)
    }

    let mappedFolders;

    if (tree.themeMap?.themes && typeof tree.themeMap.themes === 'object') {
        mappedFolders = tree.themeMap.themes[themeClass];

        if (!Array.isArray(mappedFolders) || mappedFolders.length === 0) {
            throw new Error(`Theme "${themeClass}" is not mapped in theme-map.json for "${tree.cssRoot}".`)
        }
    } else {
        mappedFolders = [themeClass.startsWith('neo-') ? themeClass.slice(4) : themeClass]
    }

    const urls           = srcFiles.map(relFile => `/__equality_css/src/${relFile}`),
          seenFolders    = new Set(['src']),
          missingFolders = [];
    let   themeSheetCount = 0;

    if (fs.existsSync(path.join(tree.cssRoot, 'theme-base'))) {
        const baseFiles = listEngineCssFiles(path.join(tree.cssRoot, 'theme-base'));

        for (const relFile of baseFiles) {
            urls.push(`/__equality_css/theme-base/${relFile}`)
        }
        seenFolders.add('theme-base')
    }

    for (const folder of mappedFolders) {
        if (!folder || seenFolders.has(folder)) {
            continue
        }

        const folderPath = path.join(tree.cssRoot, folder);

        if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
            missingFolders.push(folder);
            continue
        }

        const files = listEngineCssFiles(folderPath);
        themeSheetCount += files.length;

        for (const relFile of files) {
            urls.push(`/__equality_css/${folder}/${relFile}`)
        }

        seenFolders.add(folder)
    }

    if (missingFolders.length > 0 || themeSheetCount === 0) {
        throw new Error(
            `Theme "${themeClass}" resolved insufficient theme stylesheets in "${tree.cssRoot}" ` +
            `(expected folder(s): ${mappedFolders.join(', ')}; missing: ${missingFolders.join(', ') || 'none'}; sheets: ${themeSheetCount}).`
        )
    }

    return urls
}

/**
 * @summary Compares two captured style snapshots and returns every differing `(component, theme, scope, state, part, property)`.
 * @param {Object} baseSnapshot Snapshot map `{[component]: {[theme]: {[scope]: {[state]: {[part]: {[property]: value}}}}}}`.
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
            const baseScopes = baseThemes[theme] || {},
                  headScopes = headThemes[theme] || {},
                  scopes     = Array.from(new Set([...Object.keys(baseScopes), ...Object.keys(headScopes)]));

            for (const scope of scopes) {
                const baseStates = baseScopes[scope] || {},
                      headStates = headScopes[scope] || {},
                      states     = Array.from(new Set([...Object.keys(baseStates), ...Object.keys(headStates)]));

                for (const state of states) {
                    const baseParts = baseStates[state] || {},
                          headParts = headStates[state] || {},
                          partKeys  = Array.from(new Set([...Object.keys(baseParts), ...Object.keys(headParts)]));

                    for (const part of partKeys) {
                        for (const property of PAINTED_PROPERTIES) {
                            totalComparisons++;

                            const baseVal = baseParts[part]?.[property] ?? '<missing>',
                                  headVal = headParts[part]?.[property] ?? '<missing>';

                            if (baseVal !== headVal) {
                                diffs.push({
                                    component,
                                    theme,
                                    scope,
                                    state,
                                    part,
                                    property,
                                    base: baseVal,
                                    head: headVal
                                })
                            }
                        }
                    }
                }
            }
        }
    }

    return {diffs, totalComparisons}
}

/**
 * @summary Validates expected-difference rule schemas (`component` required, unknown keys rejected).
 * @param {Object[]} expectedRules Candidate expected-difference rules.
 */
export function validateExpectedRules(expectedRules) {
    if (!Array.isArray(expectedRules)) {
        throw new Error('Expected-difference rules must be an array of rule objects.')
    }

    expectedRules.forEach((rule, index) => {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
            throw new Error(`Expected-difference rule[${index}] must be a plain object.`)
        }

        for (const key of Object.keys(rule)) {
            if (!ALLOWED_RULE_KEYS.has(key)) {
                throw new Error(
                    `Unknown key "${key}" in expected-difference rule[${index}] ` +
                    `(allowed: ${[...ALLOWED_RULE_KEYS].join(', ')}).`
                )
            }

            if (rule[key] !== undefined && (typeof rule[key] !== 'string' || !rule[key].trim())) {
                throw new Error(`Field "${key}" in expected-difference rule[${index}] must be a non-empty string.`)
            }
        }

        if (typeof rule.component !== 'string' || !rule.component.trim() || rule.component.trim() === '*') {
            throw new Error(`Expected-difference rule[${index}] requires a specific non-wildcard "component" string.`)
        }
    })
}

/**
 * @summary Checks whether an observed difference matches a declared expected-difference rule.
 * Wildcard `'*'` or omitted optional fields (`theme`, `scope`, `state`, `part`, `property`, `base`, `head`) match any value;
 * `component` is required on every expected rule.
 * @param {Object} diff Observed difference row.
 * @param {Object} rule Validated expected rule `{component, theme?, scope?, state?, part?, property?, base?, head?, reason?}`.
 * @returns {Boolean}
 */
function matchesExpectedRule(diff, rule) {
    for (const field of MATCHED_RULE_KEYS) {
        const expected = rule[field];

        if (expected !== undefined && expected !== '*' && expected !== diff[field]) {
            return false
        }
    }

    return true
}

/**
 * @summary Evaluates observed differences against declared expected-difference rules.
 * Validates rule schemas first; declared differences pass, undeclared differences fail, and unmet rules fail.
 * @param {Object[]} diffs Observed differences from `compareSnapshots`.
 * @param {Object[]} [expectedRules=[]] Expected difference rules.
 * @returns {Object} Verdict `{ok, unexpectedDiffs, matchedDiffs, unmetExpected}`.
 */
export function evaluateExpectedDiffs(diffs, expectedRules = []) {
    validateExpectedRules(expectedRules);

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
 * @summary Formats the equality run result as a Markdown report with part-granular diff and unmet-expected tables.
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
        `- **Scopes:** ${(result.scopes || SCOPES).join(', ')}`,
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
            `| Component | Theme | Scope | State | Part | Property | Base | Head | Disposition |`,
            `|---|---|---|---|---|---|---|---|---|`
        );

        const unexpectedSet = new Set(result.unexpectedDiffs);

        for (const diff of result.diffs) {
            const disposition = unexpectedSet.has(diff) ? 'undeclared' : 'expected';
            lines.push(`| \`${diff.component}\` | \`${diff.theme}\` | \`${diff.scope}\` | \`${diff.state}\` | \`${diff.part}\` | \`${diff.property}\` | \`${diff.base}\` | \`${diff.head}\` | ${disposition} |`)
        }
    }

    if (result.unmetExpected.length > 0) {
        lines.push(
            ``,
            `## Unmet Expected Differences`,
            ``,
            `| Component | Theme | Scope | State | Part | Property |`,
            `|---|---|---|---|---|---|`
        );

        for (const rule of result.unmetExpected) {
            lines.push(`| \`${rule.component}\` | \`${rule.theme ?? '*'}\` | \`${rule.scope ?? '*'}\` | \`${rule.state ?? '*'}\` | \`${rule.part ?? '*'}\` | \`${rule.property ?? '*'}\` |`)
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
 * @summary Normalizes a single selector or selector list into a non-empty array of CSS selectors.
 * @param {String|String[]} value Raw selector or array of selectors.
 * @returns {String[]} Selector array.
 */
function toSelectorArray(value) {
    return Array.isArray(value) ? value : [value]
}

/**
 * @summary Prepares serializable component descriptors with normalized part specs and per-state target selector arrays.
 * @returns {Object[]} Normalized matrix descriptors.
 */
function buildNormalizedMatrix() {
    return COMPONENT_MATRIX.map(entry => ({
        ...entry,
        normalizedParts: entry.parts.map(normalizePartSpec),
        resolvedTargets: {
            default : toSelectorArray(entry.stateTargets?.default  || entry.stateTargetSelector),
            hover   : toSelectorArray(entry.stateTargets?.hover    || entry.stateTargetSelector),
            active  : toSelectorArray(entry.stateTargets?.active  || entry.stateTargetSelector),
            focus   : toSelectorArray(entry.stateTargets?.focus    || entry.inputSelector || entry.stateTargetSelector),
            selected: toSelectorArray(entry.stateTargets?.selected || entry.stateTargetSelector),
            pressed : toSelectorArray(entry.stateTargets?.pressed  || entry.stateTargetSelector),
            disabled: toSelectorArray(entry.stateTargets?.disabled || entry.stateTargetSelector),
            invalid : toSelectorArray(entry.stateTargets?.invalid  || entry.stateTargetSelector),
            readonly: toSelectorArray(entry.stateTargets?.readonly || entry.stateTargetSelector)
        }
    }))
}

/**
 * @summary Captures computed styles for every entry in `COMPONENT_MATRIX` across `themes`, `SCOPES`, and `states`.
 * @param {Object} page Playwright Page instance.
 * @param {Number} port Local server port.
 * @param {Object} tree Resolved built tree.
 * @param {String[]} themes Theme class names to evaluate.
 * @param {Map<String, String[]>} urlsByTheme Pre-validated stylesheet URLs keyed by theme class.
 * @returns {Promise<Object>} Captured snapshot map.
 */
async function captureTreeSnapshot(page, port, tree, themes, urlsByTheme) {
    const normalizedEntries = buildNormalizedMatrix();

    await page.goto(`http://127.0.0.1:${port}/test/playwright/component/apps/theme-equality/index.html`, {
        waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('#theme-equality-viewport[data-ready="true"]', {timeout: 30000});

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');

    // Mount the first theme's stylesheets before validating pseudo-element `content` so structural `::before`/`::after` rules are active
    const initialTheme = themes[0];
    await page.evaluate(async ({themeClass, sheetUrls, allThemes}) => {
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
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    }, {
        themeClass: initialTheme,
        sheetUrls : urlsByTheme.get(initialTheme),
        allThemes : THEMES
    });

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

            if (!cell.querySelector(entry.stateTargetSelector)) {
                missing.push(`${entry.id}: missing stateTargetSelector "${entry.stateTargetSelector}"`)
            }

            if (entry.inputSelector && !cell.querySelector(entry.inputSelector)) {
                missing.push(`${entry.id}: missing inputSelector "${entry.inputSelector}"`)
            }

            for (const state of entry.states) {
                for (const stateSel of entry.resolvedTargets[state]) {
                    if (!cell.querySelector(stateSel)) {
                        missing.push(`${entry.id}: missing target "${stateSel}" for state "${state}"`)
                    }
                }
            }

            for (const part of entry.normalizedParts) {
                const partEl = cell.querySelector(part.selector);

                if (!partEl) {
                    missing.push(`${entry.id}: missing part "${part.id}"`)
                } else if (part.pseudo) {
                    const content = getComputedStyle(partEl, part.pseudo).getPropertyValue('content').trim();
                    if (!content || content === 'none') {
                        missing.push(`${entry.id}: pseudo-element part "${part.id}" has unrendered content (${content || 'empty'})`)
                    }
                }
            }

            if (cell.querySelectorAll(entry.scopeSelector || ':scope > *').length === 0) {
                missing.push(`${entry.id}: missing scopeSelector "${entry.scopeSelector || ':scope > *'}"`)
            }
        }

        return missing
    }, normalizedEntries);

    if (missingSelectors.length > 0) {
        await cdp.detach();
        throw new Error(`Unmatched DOM selectors in theme-equality stage:\n- ${missingSelectors.join('\n- ')}`)
    }

    const {root}         = await cdp.send('DOM.getDocument', {depth: -1}),
          parentByNodeId = new Map(),
          hoverNodeIds   = {},
          activeNodeIds  = {},
          focusNodeIds   = {};

    const indexDomTree = node => {
        for (const child of node.children || []) {
            parentByNodeId.set(child.nodeId, node.nodeId);
            indexDomTree(child)
        }
    };
    indexDomTree(root);

    const buildPseudoDirectives = (cellNodeId, targetNodeIds, directPseudo, ancestorPseudo) => {
        const byNode    = new Map();
        const addPseudo = (id, list) => {
            let set = byNode.get(id);
            if (!set) {
                set = new Set();
                byNode.set(id, set)
            }
            list.forEach(p => set.add(p))
        };

        for (const targetId of targetNodeIds) {
            addPseudo(targetId, directPseudo);

            if (ancestorPseudo.length > 0) {
                let cur = parentByNodeId.get(targetId);
                while (cur && cur !== cellNodeId) {
                    addPseudo(cur, ancestorPseudo);
                    cur = parentByNodeId.get(cur)
                }
            }
        }

        return [...byNode.entries()].map(([nodeId, set]) => ({nodeId, pseudoClasses: [...set]}))
    };

    await Promise.all(normalizedEntries.map(async entry => {
        const cellPrefix = `#eq-cell-${entry.cellId}`,
              {nodeId: cellNodeId = 0} = await cdp.send('DOM.querySelector', {
                  nodeId  : root.nodeId,
                  selector: cellPrefix
              });

        if (!cellNodeId) return;

        const queryTargets = async selectors => {
            const ids = await Promise.all(selectors.map(async sel => {
                const {nodeId} = await cdp.send('DOM.querySelector', {
                    nodeId  : cellNodeId,
                    selector: sel
                });
                return nodeId
            }));
            return ids.filter(Boolean)
        };

        if (entry.states.includes('hover')) {
            const ids = await queryTargets(entry.resolvedTargets.hover);
            if (ids.length) hoverNodeIds[entry.id] = buildPseudoDirectives(cellNodeId, ids, ['hover'], ['hover'])
        }

        if (entry.states.includes('active')) {
            const ids = await queryTargets(entry.resolvedTargets.active);
            if (ids.length) activeNodeIds[entry.id] = buildPseudoDirectives(cellNodeId, ids, ['active'], ['active'])
        }

        if (entry.states.includes('focus')) {
            const ids = await queryTargets(entry.resolvedTargets.focus);
            if (ids.length) focusNodeIds[entry.id] = buildPseudoDirectives(cellNodeId, ids, ['focus', 'focus-visible', 'focus-within'], ['focus-within'])
        }
    }));

    const snapshot      = {},
          hoverEntries  = normalizedEntries.filter(e => e.states.includes('hover')),
          activeEntries = normalizedEntries.filter(e => e.states.includes('active')),
          focusEntries  = normalizedEntries.filter(e => e.states.includes('focus')),
          DOM_STATES    = ['default', 'selected', 'pressed', 'disabled', 'invalid', 'readonly'];

    for (const entry of normalizedEntries) {
        snapshot[entry.id] = {}
    }

    for (let themeIdx = 0; themeIdx < themes.length; themeIdx++) {
        const theme = themes[themeIdx],
              urls  = urlsByTheme.get(theme);

        for (const entry of normalizedEntries) {
            snapshot[entry.id][theme] = {}
        }

        await page.evaluate(async ({themeClass, sheetUrls, allThemes, skipReload}) => {
            const viewport = document.getElementById('theme-equality-viewport');

            if (!skipReload) {
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
                void loaded
            }

            const scheme = getComputedStyle(document.body).getPropertyValue('--neo-color-scheme').trim();
            document.documentElement.style.colorScheme = scheme === 'dark' || scheme === 'light' ? scheme : '';

            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        }, {
            themeClass: theme,
            sheetUrls : urls,
            allThemes : THEMES,
            skipReload: themeIdx === 0
        });

        for (const scope of SCOPES) {
            for (const entry of normalizedEntries) {
                snapshot[entry.id][theme][scope] = {}
            }

            if (scope === 'scoped') {
                await page.evaluate(({themeClass, entries}) => {
                    for (const entry of entries) {
                        const cell  = document.getElementById(`eq-cell-${entry.cellId}`),
                              roots = cell ? cell.querySelectorAll(entry.scopeSelector || ':scope > *') : [];

                        roots.forEach(el => el.classList.add(themeClass))
                    }
                }, {themeClass: theme, entries: normalizedEntries})
            }

            try {
                const domBatch = await page.evaluate(({entries, domStates, props}) => {
                    const readParts = (cell, parts) => {
                        const partValues = {};
                        for (const part of parts) {
                            const partEl = cell?.querySelector(part.selector);
                            if (!partEl) continue;
                            const computed = getComputedStyle(partEl, part.pseudo || null),
                                  values   = {};
                            for (const prop of props) {
                                values[prop] = computed.getPropertyValue(prop).trim()
                            }
                            partValues[part.id] = values
                        }
                        return partValues
                    };

                    const batchOut = {};

                    for (const entry of entries) {
                        const cell  = document.getElementById(`eq-cell-${entry.cellId}`),
                              input = entry.inputSelector ? cell?.querySelector(entry.inputSelector) : null;

                        batchOut[entry.id] = {};

                        for (const stateName of domStates) {
                            if (!entry.states.includes(stateName)) continue;

                            const targets = entry.resolvedTargets[stateName]
                                      .map(sel => cell?.querySelector(sel))
                                      .filter(Boolean),
                                  undo    = [];
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

                            for (const target of targets) {
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

                            batchOut[entry.id][stateName] = readParts(cell, entry.normalizedParts);

                            for (let i = undo.length - 1; i >= 0; i--) {
                                undo[i]()
                            }
                        }
                    }

                    return batchOut
                }, {
                    entries  : normalizedEntries,
                    domStates: DOM_STATES,
                    props    : PAINTED_PROPERTIES
                });

                for (const [entryId, stateMap] of Object.entries(domBatch)) {
                    Object.assign(snapshot[entryId][theme][scope], stateMap)
                }

                const runPseudoBatch = async (stateName, entries, nodeMap, extraClasses) => {
                    const mergedByNode = new Map();

                    for (const entry of entries) {
                        for (const {nodeId, pseudoClasses} of (nodeMap[entry.id] || [])) {
                            let set = mergedByNode.get(nodeId);
                            if (!set) {
                                set = new Set();
                                mergedByNode.set(nodeId, set)
                            }
                            pseudoClasses.forEach(cls => set.add(cls))
                        }
                    }

                    await Promise.all([...mergedByNode.entries()].map(([nodeId, set]) =>
                        cdp.send('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: [...set]})
                    ));

                    const results = await page.evaluate(({subset, stateKey, extraCls, props}) => {
                        const out      = {},
                              undo     = [],
                              addClass = (el, cls) => {
                                  if (el && !el.classList.contains(cls)) {
                                      el.classList.add(cls);
                                      undo.push(() => el.classList.remove(cls))
                                  }
                              };

                        for (const entry of subset) {
                            const cell         = document.getElementById(`eq-cell-${entry.cellId}`),
                                  baseTarget   = cell?.querySelector(entry.stateTargetSelector),
                                  stateTargets = entry.resolvedTargets[stateKey]
                                      .map(sel => cell?.querySelector(sel))
                                      .filter(Boolean);

                            for (const cls of extraCls) {
                                addClass(baseTarget, cls);
                                for (const stateTarget of stateTargets) {
                                    if (stateTarget !== baseTarget) {
                                        addClass(stateTarget, cls)
                                    }
                                }
                            }
                        }

                        for (const entry of subset) {
                            const cell        = document.getElementById(`eq-cell-${entry.cellId}`),
                                   partValues = {};

                            for (const part of entry.normalizedParts) {
                                const partEl = cell?.querySelector(part.selector);
                                if (!partEl) continue;
                                const computed = getComputedStyle(partEl, part.pseudo || null),
                                      values   = {};
                                for (const prop of props) {
                                    values[prop] = computed.getPropertyValue(prop).trim()
                                }
                                partValues[part.id] = values
                            }

                            out[entry.id] = partValues
                        }

                        for (let i = undo.length - 1; i >= 0; i--) {
                            undo[i]()
                        }

                        return out
                    }, {subset: entries, stateKey: stateName, extraCls: extraClasses, props: PAINTED_PROPERTIES});

                    await Promise.all([...mergedByNode.keys()].map(nodeId =>
                        cdp.send('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: []})
                    ));

                    for (const [entryId, partValues] of Object.entries(results)) {
                        snapshot[entryId][theme][scope][stateName] = partValues
                    }
                };

                await runPseudoBatch('hover', hoverEntries, hoverNodeIds, ['neo-hovered']);
                await runPseudoBatch('active', activeEntries, activeNodeIds, []);
                await runPseudoBatch('focus', focusEntries, focusNodeIds, ['neo-focus', 'neo-focus-keyboard'])
            } finally {
                if (scope === 'scoped') {
                    await page.evaluate(({themeClass, entries}) => {
                        for (const entry of entries) {
                            const cell  = document.getElementById(`eq-cell-${entry.cellId}`),
                                  roots = cell ? cell.querySelectorAll(entry.scopeSelector || ':scope > *') : [];

                            roots.forEach(el => el.classList.remove(themeClass))
                        }
                    }, {themeClass: theme, entries: normalizedEntries})
                }
            }
        }
    }

    await cdp.detach();
    return snapshot
}

/**
 * @summary Pre-validates that every requested theme resolves structural and theme CSS files in `tree`.
 * @param {Object} tree Resolved built tree.
 * @param {String[]} themes Requested theme class names.
 * @returns {Map<String, String[]>} Validated stylesheet URLs per theme.
 */
function buildValidatedThemeUrlMap(tree, themes) {
    if (!Array.isArray(themes) || themes.length === 0) {
        throw new Error('At least one theme class name must be supplied.')
    }

    const map = new Map();

    for (const theme of themes) {
        map.set(theme, collectThemeStylesheetUrls(tree, theme))
    }

    return map
}

/**
 * @summary Executes a full headless computed-style equality comparison between two built trees.
 * Validates expected rules, structural CSS, and requested theme sheets up front, and closes both
 * the browser and loopback server on partial startup failures.
 * @param {Object} options Run configuration `{base, head, env?, expected?, themes?, repoRoot?, executablePath?}`.
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

    validateExpectedRules(expectedRules);

    const baseTree    = resolveBuiltTree(options.base, env),
          headTree    = resolveBuiltTree(options.head, env),
          baseUrlsMap = buildValidatedThemeUrlMap(baseTree, themes),
          headUrlsMap = buildValidatedThemeUrlMap(headTree, themes);

    let activeTree = baseTree,
        server     = null,
        browser    = null;

    try {
        server  = await startEqualityServer(repoRoot, () => activeTree);
        browser = await chromium.launch({
            headless: true,
            ...(options.executablePath ? {executablePath: options.executablePath} : {})
        });

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
        const baseSnapshot = await captureTreeSnapshot(page, server.port, baseTree, themes, baseUrlsMap);

        activeTree = headTree;
        const headSnapshot = await captureTreeSnapshot(page, server.port, headTree, themes, headUrlsMap);

        await context.close();

        const {diffs, totalComparisons} = compareSnapshots(baseSnapshot, headSnapshot),
              verdict                   = evaluateExpectedDiffs(diffs, expectedRules),
              elapsedMs                 = Math.round(performance.now() - startMs);

        return {
            ok             : verdict.ok,
            elapsedMs,
            themes,
            scopes         : [...SCOPES],
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
        await browser?.close().catch(() => {});
        await server?.close().catch(() => {})
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
        .description('Compare computed painted styles across themes, scopes, states, and parts between two built CSS trees.')
        .requiredOption('-b, --base <path>', 'Base built CSS folder or checkout/worktree root')
        .option('-h, --head <path>', 'Head built CSS folder or checkout/worktree root', REPO_ROOT)
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
