/**
 * @module buildScripts/util/theme-release-compare
 * @summary Compares a built `dev` tree's theme-Neo surfaces with the released site, page by page, by computed style.
 *
 * `theme-equality` and the visual goldens both compare against `dev`, so a defect `dev` already carries
 * passes both. This runner loads each surface twice: from the released site, with a desktop Chrome user
 * agent (neomjs.com answers other agents with a scriptless prerender), and from a built tree served on
 * loopback. It does so in every theme Neo scheme the surface lists, and saves both whole-viewport frames.
 *
 * The report's contract, per run (surface × scheme):
 * - `outcome`: `differs` or `equal` when both sides loaded in the requested scheme; `new` when only `dev`
 *   loads, `dev-failed` when only the released site loads, `failed` when neither does, and
 *   `scheme-unverified` when a side painted another theme than the one requested. Only the first two carry rows.
 * - `sides.released` and `sides.dev`: `status` (`ok` or `error`), the theme class the main view `observed`, and
 *   `via`: `load` when the page loaded in that theme, `switcher` when its own theme switcher had to set it
 *   (a page that ignores `?theme=`), `null` when neither did.
 * - `coverage`: per element group, how many elements each side sampled. Elements that only appear after an
 *   interaction (a tooltip's bubble, a menu, a drag proxy) are never sampled.
 * - `rows`: one per differing property of a paired element, or per element present on one side only
 *   (`property: '(element)'`). Elements pair by group and label, digits masked, so an inserted control or a
 *   live number does not shift its neighbours. `owner` is the custom property the `dev` value was measured to
 *   flow through: overriding it on the declaring element changed the value. `equalValue` lists the element's
 *   custom properties whose value merely equals the `dev` value: a lead, never a verdict.
 *
 * A near-equal color pair (a palette re-tint) is dropped unless it crosses a contrast threshold (3:1 or 4.5:1)
 * against what it paints on; such a row carries `crossing`.
 *
 * The tree must be a git-archive export, never the working checkout, so no stale `dist` file can stand in for
 * a deleted sheet. Inside it, run `npm run build-themes -- -n -e dev -t all` and `npm run bundle-browser-deps`
 * (the Mermaid and Monaco wrappers load those bundles).
 *
 *     npm run theme-release-compare -- --tree <built-export> --out <dir>
 *     npm run theme-release-compare -- --tree <built-export> --out <dir> --surfaces examples/dialog,examples/tooltip
 */
import {chromium}    from '@playwright/test';
import {Command}     from 'commander';
import fs            from 'node:fs';
import http          from 'node:http';
import path          from 'node:path';
import process       from 'node:process';
import isEntryModule from './isEntryModule.mjs';

/**
 * The released site's agent filter serves a scriptless prerender to headless and unknown agents.
 * @type {String}
 */
export const RELEASED_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/**
 * The theme Neo schemes a surface is compared in, when its `neo-config.json` lists them.
 * @type {String[]}
 */
export const SCHEMES = ['neo-theme-neo-light', 'neo-theme-neo-dark'];

/**
 * The element set: a group name and the selector whose first rendered matches are compared.
 * @type {Array<String[]>}
 */
export const ELEMENT_SET = [
    ['button',        '.neo-button'],
    ['field',         '.neo-textfield .neo-textfield-input'],
    ['toolbar',       '.neo-toolbar'],
    ['tab',           '.neo-tab-header-button'],
    ['grid-header',   '.neo-grid-header-button'],
    ['grid-row',      '.neo-grid-row'],
    ['list-item',     '.neo-list-item'],
    ['dialog',        '.neo-dialog'],
    ['dialog-header', '.neo-dialog .neo-header-toolbar'],
    ['panel',         '.neo-panel'],
    ['fieldset',      '.neo-fieldset']
];

/**
 * The computed properties compared per element. Colors are normalized to 8-bit sRGB in the page.
 * @type {String[]}
 */
export const PROPERTIES = [
    'color', 'background-color', 'border-top-color', 'border-top-style', 'border-top-width', 'border-radius',
    'box-shadow', 'font-size', 'font-weight', 'height', 'padding-top', 'padding-left'
];

/**
 * Extra elements sampled per group beyond `perGroup`, so an insertion near the top still leaves every compared
 * element a partner to pair with.
 * @type {Number}
 */
const PAIRING_SLACK = 4;

/**
 * The contrast floors a near-equal color pair must not cross unreported: non-text (3:1) and text (4.5:1).
 * @type {Number[]}
 */
const CONTRAST_FLOORS = [3, 4.5];

/**
 * @summary Lists the surfaces of a tree whose `neo-config.json` names a theme Neo scheme.
 * Child apps open through their parent window, so they are left out.
 * @param {String} tree The root of a built export.
 * @returns {Object[]} `{surface, schemes}` sorted by surface, `surface` relative to the tree.
 */
export function discoverSurfaces(tree) {
    const found = [];

    const walk = dir => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'childapps') continue;

            const child  = path.join(dir, entry.name),
                  config = path.join(child, 'neo-config.json');

            if (fs.existsSync(config)) {
                const text    = fs.readFileSync(config, 'utf8'),
                      schemes = SCHEMES.filter(scheme => text.includes(scheme));

                if (schemes.length) {
                    found.push({surface: path.relative(tree, child).split(path.sep).join('/'), schemes})
                }
            }

            walk(child)
        }
    };

    for (const root of ['apps', 'examples']) {
        const dir = path.join(tree, root);
        fs.existsSync(dir) && walk(dir)
    }

    return found.sort((a, b) => a.surface.localeCompare(b.surface))
}

/**
 * @summary Parses a normalized `rgba()` value.
 * @param {String} value
 * @returns {Number[]|undefined} `[r, g, b, a]`
 */
const parseRgba = value => value?.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/)?.slice(1).map(Number);

/**
 * @summary Whether two normalized `rgba()` values differ by no more than a palette re-tint: at most 6 per
 * channel and 0.02 in alpha. The neutral ramps moved hue between releases (`#0e0f0d` → `#0e0f13`).
 * @param {String} a
 * @param {String} b
 * @returns {Boolean}
 */
export function nearSameColor(a, b) {
    const x = parseRgba(a),
          y = parseRgba(b);

    return Boolean(x && y) && x.slice(0, 3).every((channel, i) => Math.abs(channel - y[i]) <= 6) && Math.abs(x[3] - y[3]) <= 0.02
}

/**
 * @summary The WCAG contrast ratio of a color painted over an opaque backdrop; a translucent color is
 * composited onto the backdrop first.
 * @param {String} color A normalized `rgba()` value.
 * @param {String} backdrop A normalized, opaque `rgba()` value.
 * @returns {Number|null} `null` when either value is no color.
 */
export function contrastOn(color, backdrop) {
    const fg = parseRgba(color),
          bg = parseRgba(backdrop);

    if (!fg || !bg) return null;

    const mixed     = fg.slice(0, 3).map((channel, i) => channel * fg[3] + bg[i] * (1 - fg[3])),
          luminance = rgb => rgb.map(channel => {
              const c = channel / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0),
          [hi, lo]  = [luminance(mixed), luminance(bg.slice(0, 3))].sort((p, q) => q - p);

    return (hi + 0.05) / (lo + 0.05)
}

/**
 * @summary The contrast floor a near-equal color pair crosses between the two sides, if any.
 * @param {Object} item The released snapshot.
 * @param {Object} match The `dev` snapshot.
 * @param {String} property
 * @returns {String|null} e.g. `'3:1'`
 */
function crossedFloor(item, match, property) {
    const before = contrastOn(item.values[property],  item.backdrop?.[property]),
          after  = contrastOn(match.values[property], match.backdrop?.[property]);

    if (before === null || after === null) return null;

    const floor = CONTRAST_FLOORS.find(value => (before >= value) !== (after >= value));
    return floor ? `${floor}:1` : null
}

/**
 * @summary Whether a snapshot draws no top border, so its border color cannot be seen.
 * @param {Object} values
 * @returns {Boolean}
 */
function drawsNoBorder(values) {
    return values['border-top-style'] === 'none' || values['border-top-width'] === '0px'
}

/**
 * @summary Orders the custom properties whose value equals a `dev` value: roles first, then the element's own
 * component variables, then palette grades, then the rest.
 * @param {String[]} names
 * @param {String} group An `ELEMENT_SET` group; its first segment names the component.
 * @returns {String[]}
 */
export function rankCandidates(names, group) {
    const component = `--neo-${group.split('-')[0]}-`,
          rank      = name => name.startsWith('--neo-color-') ? 0 : name.startsWith(component) ? 1 : name.startsWith('--neo-palette-') ? 2 : 3;

    return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/**
 * @summary Pairs two sampled lists of one group. The longest common subsequence of labels anchors the pairs;
 * between two anchors, equally many leftovers on each side pair in order (a relabelled element). The rest
 * stay unpaired.
 * @param {Object[]} released Snapshots in document order, each with a `label`.
 * @param {Object[]} dev
 * @returns {Object} `{pairs: Array<Object[]>, releasedOnly: Object[], devOnly: Object[]}`
 */
export function alignGroup(released, dev) {
    const n     = released.length,
          m     = dev.length,
          table = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            table[i][j] = released[i].label === dev[j].label ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
        }
    }

    const anchors = [];

    for (let i = 0, j = 0; i < n && j < m;) {
        if (released[i].label === dev[j].label) {anchors.push([i, j]); i++; j++}
        else if (table[i + 1][j] >= table[i][j + 1]) i++
        else j++
    }

    const pairs        = [],
          releasedOnly = [],
          devOnly      = [];

    let i = 0,
        j = 0;

    for (const [ai, aj] of [...anchors, [n, m]]) {
        const gapReleased = released.slice(i, ai),
              gapDev      = dev.slice(j, aj);

        if (gapReleased.length === gapDev.length) {
            gapReleased.forEach((item, k) => pairs.push([item, gapDev[k]]))
        } else {
            releasedOnly.push(...gapReleased);
            devOnly.push(...gapDev)
        }

        ai < n && pairs.push([released[ai], dev[aj]]);
        i = ai + 1;
        j = aj + 1
    }

    return {pairs, releasedOnly, devOnly}
}

/**
 * @summary Pairs the released and `dev` element snapshots of one surface and scheme and lists every property
 * whose value differs, plus the elements present on one side only. Elements past `perGroup` on both sides only
 * serve as pairing slack. A border color is skipped when neither side draws that border.
 * @param {Object[]} released `{key, group, index, label, values, backdrop, vars}` from the released page.
 * @param {Object[]} dev The same from the `dev` page.
 * @param {Number} [perGroup=Infinity]
 * @returns {Object[]} `{key, group, property, released, dev, equalValue, devIndex}` (plus `crossing` and
 * `devKey` where they apply); a one-sided element reports `property: '(element)'`.
 */
export function diffSnapshots(released, dev, perGroup = Infinity) {
    const rows   = [],
          groups = [...new Set([...released, ...dev].map(item => item.group))];

    for (const group of groups) {
        const {pairs, releasedOnly, devOnly} = alignGroup(released.filter(item => item.group === group), dev.filter(item => item.group === group));

        for (const [item, match] of pairs) {
            if ((item.index ?? 0) >= perGroup && (match.index ?? 0) >= perGroup) continue;

            for (const property of PROPERTIES) {
                const before = item.values[property],
                      after  = match.values[property];

                if (before === after) continue;
                if (property === 'border-top-color' && drawsNoBorder(item.values) && drawsNoBorder(match.values)) continue;

                const crossing = nearSameColor(before, after) ? crossedFloor(item, match, property) : null;

                if (nearSameColor(before, after) && !crossing) continue;

                const names = (match.vars || []).filter(entry => entry.value === after).map(entry => entry.name);

                rows.push({
                    key       : item.key,
                    ...(match.key !== item.key && {devKey: match.key}),
                    group,
                    property,
                    released: before,
                    dev     : after,
                    devIndex: match.index ?? 0,
                    ...(crossing && {crossing}),
                    equalValue: rankCandidates(names, group).slice(0, 4)
                })
            }
        }

        for (const item of releasedOnly) {
            (item.index ?? 0) < perGroup && rows.push({key: item.key, group, property: '(element)', released: 'present', dev: 'missing', equalValue: []})
        }

        for (const item of devOnly) {
            (item.index ?? 0) < perGroup && rows.push({key: item.key, group, property: '(element)', released: 'missing', dev: 'present', devIndex: item.index ?? 0, equalValue: []})
        }
    }

    return rows
}

/**
 * @summary Derives a run's outcome from its two sides.
 * @param {String} scheme The requested theme.
 * @param {Object} released `{status, observed}`
 * @param {Object} dev `{status, observed}`
 * @returns {String} `equal`, `differs`, `new`, `dev-failed`, `failed` or `scheme-unverified`; the first two
 * only after rows are known, so this returns `compare` for them.
 */
export function sideOutcome(scheme, released, dev) {
    const releasedOk = released.status === 'ok',
          devOk      = dev.status === 'ok';

    if (!releasedOk && !devOk) return 'failed';
    if (!releasedOk)           return 'new';
    if (!devOk)                return 'dev-failed';
    if (released.observed !== scheme || dev.observed !== scheme) return 'scheme-unverified';
    return 'compare'
}

/**
 * @summary Renders the run as Markdown for the release gate: totals first, the runs that could not be
 * compared, then one table per differing run.
 * @param {Object} result `{released, tree, runs}`, each run `{surface, scheme, outcome, sides, coverage, rows}`.
 * @returns {String}
 */
export function formatReport(result) {
    const {runs} = result,
          count  = outcome => runs.filter(run => run.outcome === outcome).length,
          side   = s => s ? (s.status === 'ok' ? `${s.observed ?? 'no theme'}${s.via === 'switcher' ? ' (via its theme switcher)' : ''}` : `error: ${s.error}`) : '?',
          lines  = [
              `# Released vs \`dev\``,
              '',
              `Released: ${result.released} · \`dev\` tree: \`${result.tree}\``,
              '',
              `${runs.length} runs (surface × scheme): ${count('differs')} differ, ${count('equal')} equal, ${count('new')} new on \`dev\`, ` +
              `${count('dev-failed')} fail on \`dev\` only, ${count('failed')} fail on both, ${count('scheme-unverified')} scheme unverified.`,
              '',
              'Elements that only appear after an interaction (a tooltip\'s bubble, a menu, a drag proxy) are never sampled. ' +
              '"Owner" is measured: overriding it changed the `dev` value. "Equal value" only shares the value.'
          ];

    for (const run of runs.filter(run => !['differs', 'equal'].includes(run.outcome))) {
        lines.push(`- **${run.surface}** · ${run.scheme}: ${run.outcome} (released: ${side(run.sides?.released)}; \`dev\`: ${side(run.sides?.dev)})`)
    }

    for (const run of runs.filter(run => run.outcome === 'differs')) {
        const sampled = Object.entries(run.coverage || {}).map(([group, [a, b]]) => `${group} ${a}/${b}`).join(', ');

        lines.push('', `## ${run.surface} · ${run.scheme.replace('neo-theme-', '')}`, '',
            `Sampled (released/\`dev\`): ${sampled || 'nothing'}`, '',
            '| Element | Property | Released | `dev` | Owner | Equal value |',
            '| :--- | :--- | :--- | :--- | :--- | :--- |');

        for (const row of run.rows) {
            const owner = row.owner?.variable ? `\`${row.owner.variable}\`${row.owner.declared ? ` = \`${row.owner.declared}\`` : ''}` : (row.owner?.literal ? 'a literal' : '');

            lines.push(`| \`${row.key}\` | ${row.property}${row.crossing ? ` (crosses ${row.crossing})` : ''} | \`${row.released}\` | \`${row.dev}\` | ${owner} | ${row.equalValue.map(name => `\`${name}\``).join(', ')} |`)
        }
    }

    return lines.join('\n') + '\n'
}

/**
 * @summary Serves one built tree read-only on loopback.
 * @param {String} root
 * @returns {Promise<{server: http.Server, port: Number}>}
 */
function serveTree(root) {
    const types = {
        '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
        '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2'
    };

    const server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://x').pathname),
              file     = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));

        if (request.method !== 'GET' || !file.startsWith(root + path.sep)) {
            response.writeHead(403).end();
            return
        }

        fs.stat(file, (error, stat) => {
            if (error || !stat.isFile()) {
                response.writeHead(404).end();
                return
            }

            response.writeHead(200, {'Cache-Control': 'no-store', 'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
            fs.createReadStream(file).pipe(response)
        })
    });

    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port})))
}

/**
 * @summary Reads the element set's computed styles in the page, and marks each sampled element with
 * `data-release-compare="<group>:<index>"` so `resolveOwners()` can find it again. Runs in the browser.
 * @param {Object} input `{elementSet, properties, perGroup}`; `perGroup` includes the pairing slack.
 * @returns {Object[]} `{key, group, index, label, values, backdrop, vars}`
 */
export function readElements({elementSet, properties, perGroup}) {
    const context = document.createElement('canvas').getContext('2d', {willReadFrequently: true}),
          isColor = name => name.endsWith('color'),
          toSrgb  = value => {
              context.clearRect(0, 0, 1, 1);
              context.fillStyle = 'rgba(0, 0, 0, 0)';
              context.fillStyle = value;
              context.fillRect(0, 0, 1, 1);
              const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
              return `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(2)})`
          },
          // What a fill or a border paints on: the backgrounds from `el` up, composited until one is opaque
          backdropOf = el => {
              const layers = [];

              for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
                  const [r, g, b, a] = toSrgb(getComputedStyle(node).backgroundColor).match(/[\d.]+/g).map(Number);
                  a > 0 && layers.push([r, g, b, a]);
                  if (a >= 1) break
              }

              let rgb = [255, 255, 255];

              for (const [r, g, b, a] of layers.reverse()) {
                  rgb = [r, g, b].map((channel, i) => channel * a + rgb[i] * (1 - a))
              }

              return `rgba(${rgb.map(Math.round).join(', ')}, 1)`
          },
          out = [];

    for (const [group, selector] of elementSet) {
        const visible = [...document.querySelectorAll(selector)].filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
        }).slice(0, perGroup);

        visible.forEach((el, index) => {
            const style  = getComputedStyle(el),
                  text   = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 24),
                  values = {},
                  vars   = [];

            // The color a reader sees is the one its text paints in. A button's label child can override the
            // button's own `color`, so `color` is read where the first text node paints.
            const walker   = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {acceptNode: node => node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP}),
                  textHost = walker.nextNode()?.parentElement || el;

            for (const property of properties) {
                const value = (property === 'color' ? getComputedStyle(textHost) : style).getPropertyValue(property);
                values[property] = isColor(property) ? toSrgb(value) : value
            }

            // A custom property holds its token text (`light-dark(...)`, a `var()` chain resolved to text), so a
            // color-valued one is resolved through a probe inside the element, where its color scheme applies.
            const probe = document.createElement('i');
            el.appendChild(probe);

            for (let i = 0; i < style.length && vars.length < 400; i++) {
                const name = style[i],
                      raw  = name.startsWith('--neo-') ? style.getPropertyValue(name).trim() : '';

                if (raw && CSS.supports('color', raw)) {
                    probe.style.color = raw;
                    vars.push({name, value: toSrgb(getComputedStyle(probe).color)})
                }
            }

            probe.remove();
            el.setAttribute('data-release-compare', `${group}:${index}`);

            out.push({
                key     : `${group}#${index}${text ? ' ' + text : ''}`,
                group,
                index,
                label   : text.replace(/\d+/g, '#'),
                values,
                backdrop: {color: backdropOf(textHost), 'border-top-color': backdropOf(el), 'background-color': backdropOf(el.parentElement || el)},
                vars
            })
        })
    }

    return out
}

/**
 * @summary Measures which custom property each differing `dev` value flows through. For each property it
 * finds the element that declares it (the paint host, or for an inherited property the nearest ancestor a
 * matching rule declares it on), collects the `var()` names that element's matching declarations read, and
 * overrides each name there in turn: the one whose override changes the measured value is the owner. It then
 * reports what the owner itself is declared as, from the nearest rule that declares it. Runs in the browser.
 * @param {Object[]} queries `{group, index, property}`
 * @returns {Object[]} `{variable, declared, literal}` per query; `variable: null` when no override moved the value.
 */
export function resolveOwners(queries) {
    const inherited  = new Set(['color', 'font-size', 'font-weight']),
          shorthands = {
              'background-color': ['background'],
              'border-radius'   : [],
              'border-top-color': ['border-top', 'border-color', 'border'],
              'border-top-style': ['border-top', 'border-style', 'border'],
              'border-top-width': ['border-top', 'border-width', 'border'],
              'font-size'       : ['font'],
              'font-weight'     : ['font'],
              'padding-left'    : ['padding', 'padding-inline'],
              'padding-top'     : ['padding', 'padding-block']
          },
          sentinel = property => ({
              'border-top-style': 'dotted', 'box-shadow': '0px 0px 0px 7px rgb(1, 2, 3)', 'font-weight': '123'
          })[property] ?? (property.endsWith('color') ? 'rgb(1, 2, 3)' : '37px'),
          rules = [];

    // Every style rule, with its selector composed through CSS nesting, in document order
    const collect = (list, parent) => {
        for (const rule of list) {
            if (rule instanceof CSSStyleRule) {
                const selector = parent ? rule.selectorText.split(',').map(part => {
                    part = part.trim();
                    return part.includes('&') ? part.replaceAll('&', `:is(${parent})`) : `:is(${parent}) ${part}`
                }).join(', ') : rule.selectorText;

                rules.push({selector, style: rule.style});
                rule.cssRules?.length && collect(rule.cssRules, selector)
            } else if (parent && rule.constructor.name === 'CSSNestedDeclarations') {
                // Declarations written after a nested rule still belong to the parent's selector
                rules.push({selector: parent, style: rule.style})
            } else if (rule.cssRules) {
                if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
                collect(rule.cssRules, parent)
            }
        }
    };

    for (const sheet of document.styleSheets) {
        try {collect(sheet.cssRules, null)} catch {/* a cross-origin sheet hides its rules */}
    }

    const matching = el => rules.filter(rule => {try {return el.matches(rule.selector)} catch {return false}}),
          declared = (el, property) => [el.style, ...matching(el).map(rule => rule.style)]
              .flatMap(style => [property, ...(shorthands[property] || [])].map(name => style.getPropertyValue(name)))
              .filter(Boolean),
          read     = (el, property) => getComputedStyle(el).getPropertyValue(property);

    return queries.map(({group, index, property}) => {
        const el = document.querySelector(`[data-release-compare="${group}:${index}"]`);
        if (!el) return {variable: null};

        let host = el;

        if (property === 'color') {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {acceptNode: node => node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP});
            host = walker.nextNode()?.parentElement || el
        }

        let declarer = host;

        if (inherited.has(property)) {
            while (declarer && !declared(declarer, property).length) declarer = declarer.parentElement
        }

        if (!declarer) return {variable: null};

        const texts    = declared(declarer, property),
              names    = [...new Set(texts.flatMap(text => [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1])))],
              original = read(host, property);

        for (const name of names) {
            declarer.style.setProperty(name, sentinel(property), 'important');
            const moved = read(host, property) !== original;
            declarer.style.removeProperty(name);

            if (moved) {
                const own = [declarer, ...(function* up(node) {while ((node = node.parentElement)) yield node})(declarer)]
                    .map(node => matching(node).map(rule => rule.style.getPropertyValue(name)).filter(Boolean).pop())
                    .find(Boolean);

                return {variable: name, declared: own?.trim() || null}
            }
        }

        return {variable: null, literal: names.length === 0 && texts.length > 0}
    })
}

/**
 * @summary Reads the theme class of the outermost themed element: the main view, whatever its class. 14.0's
 * theme switcher carries `neo-theme-switcher`, which is no theme.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String|null>}
 */
function observeTheme(page) {
    return page.evaluate(() => {
        const isTheme = name => name.startsWith('neo-theme-') && !/^neo-theme-(switcher|scope)/.test(name);

        for (const el of document.querySelectorAll('[class*="neo-theme-"]')) {
            const theme = [...el.classList].find(isTheme);
            if (theme) return theme
        }

        return null
    })
}

/**
 * @summary Brings a page to the requested theme. The page loads with `?theme=`; one that ignores it is
 * switched through its own theme switcher, picking the menu item labelled with the scheme.
 * @param {import('@playwright/test').Page} page
 * @param {String} scheme
 * @returns {Promise<Object>} `{observed, via}`; `via` is `null` when neither entry point set the theme.
 */
async function enforceScheme(page, scheme) {
    let observed = await observeTheme(page);
    if (observed === scheme) return {observed, via: 'load'};

    const switcher = page.locator('.neo-themeswitcher, .neo-theme-switcher').first(),
          label    = scheme.endsWith('dark') ? 'Neo Dark' : 'Neo Light';

    try {
        for (let attempt = 0; attempt < 3 && observed !== scheme && await switcher.count(); attempt++) {
            await switcher.click();
            await page.waitForTimeout(300);

            // A menu switcher offers the themes by name; a toggle switcher has already switched
            const item = page.locator('.neo-list-item, .neo-menu-item', {hasText: label}).first();

            if (await item.count()) {
                await item.isVisible() ? await item.click() : await page.keyboard.press('Escape');
                await page.waitForTimeout(300)
            }

            observed = await observeTheme(page)
        }
    } catch {
        observed = await observeTheme(page)
    }

    await page.mouse.move(1, 1);
    return {observed, via: observed === scheme ? 'switcher' : null}
}

/**
 * @summary Loads one side of a run in its own context (the scheme's `prefers-color-scheme` emulated), brings
 * it to the scheme, waits for it to settle, saves its frame and reads its elements.
 * @param {import('@playwright/test').Browser} browser
 * @param {String} url
 * @param {String} scheme
 * @param {String} framePath
 * @param {Object} options `{perGroup, settleMs, timeoutMs}`
 * @returns {Promise<Object>} `{status, error, observed, via, elements, page, context}`; the caller closes `context`.
 */
async function captureSide(browser, url, scheme, framePath, {perGroup, settleMs, timeoutMs}) {
    const context = await browser.newContext({userAgent: RELEASED_USER_AGENT, viewport: {width: 1280, height: 800}, colorScheme: scheme.endsWith('dark') ? 'dark' : 'light'}),
          page    = await context.newPage();

    try {
        await page.goto(url, {timeout: timeoutMs});
        await page.waitForFunction(() => window.Neo && document.querySelector('.neo-viewport, .neo-container'), null, {timeout: timeoutMs});
        await page.waitForTimeout(settleMs);

        const {observed, via} = await enforceScheme(page, scheme);

        via === 'switcher' && await page.waitForTimeout(settleMs);
        await page.screenshot({path: framePath});

        const elements = await page.evaluate(readElements, {elementSet: ELEMENT_SET, properties: PROPERTIES, perGroup: perGroup + PAIRING_SLACK});
        return {status: 'ok', observed, via, elements, page, context}
    } catch (error) {
        return {status: 'error', error: error.message.split('\n')[0], context}
    }
}

/**
 * @summary Counts the sampled elements per group within `perGroup`, released and `dev`.
 * @param {Object[]} released
 * @param {Object[]} dev
 * @param {Number} perGroup
 * @returns {Object<String, Number[]>}
 */
function coverageOf(released = [], dev = [], perGroup) {
    const coverage = {},
          count    = (list, group) => list.filter(item => item.group === group && item.index < perGroup).length;

    for (const [group] of ELEMENT_SET) {
        const sampled = [count(released, group), count(dev, group)];
        (sampled[0] || sampled[1]) && (coverage[group] = sampled)
    }

    return coverage
}

/**
 * @summary Runs the comparison and writes `report.json`, `report.md` and the frames under `out`.
 * @param {Object} options `{tree, out, released, surfaces, perGroup, settleMs, timeoutMs}`
 * @returns {Promise<Object>} The result `formatReport()` renders.
 */
export async function runReleaseCompare(options) {
    const tree           = path.resolve(options.tree),
          out            = path.resolve(options.out),
          frames         = path.join(out, 'frames'),
          wanted         = options.surfaces ? new Set(options.surfaces) : null,
          surfaces       = discoverSurfaces(tree).filter(entry => !wanted || wanted.has(entry.surface)),
          {server, port} = await serveTree(tree),
          browser        = await chromium.launch({headless: true}),
          result         = {released: options.released, tree, runs: []};

    fs.mkdirSync(frames, {recursive: true});

    try {
        for (const {surface, schemes} of surfaces) {
            for (const scheme of schemes) {
                const slug     = `${surface.replaceAll('/', '-')}-${scheme.replace('neo-theme-neo-', '')}`,
                      page     = `/${surface}/index.html?theme=${scheme}`,
                      released = await captureSide(browser, options.released + page, scheme, path.join(frames, `${slug}-released.png`), options),
                      dev      = await captureSide(browser, `http://127.0.0.1:${port}${page}`, scheme, path.join(frames, `${slug}-dev.png`), options),
                      summary  = side => ({status: side.status, ...(side.error && {error: side.error}), observed: side.observed ?? null, via: side.via ?? null}),
                      run      = {surface, scheme, sides: {released: summary(released), dev: summary(dev)}};

                try {
                    run.coverage = coverageOf(released.elements, dev.elements, options.perGroup);
                    run.outcome  = sideOutcome(scheme, run.sides.released, run.sides.dev);

                    if (run.outcome === 'compare') {
                        run.rows    = diffSnapshots(released.elements, dev.elements, options.perGroup);
                        run.outcome = run.rows.length ? 'differs' : 'equal';

                        const queries = run.rows.filter(row => row.property !== '(element)').map(row => ({group: row.group, index: row.devIndex, property: row.property})),
                              owners  = queries.length ? await dev.page.evaluate(resolveOwners, queries) : [];

                        run.rows.filter(row => row.property !== '(element)').forEach((row, i) => {row.owner = owners[i]})
                    }
                } finally {
                    await released.context.close();
                    await dev.context.close()
                }

                result.runs.push(run);
                console.log(`${surface} · ${scheme}: ${run.outcome}${run.rows ? ` (${run.rows.length} rows)` : ''}`)
            }
        }
    } finally {
        await browser.close();
        server.close()
    }

    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(out, 'report.md'), formatReport(result));

    return result
}

/**
 * @summary CLI entry: parses the options and runs the comparison.
 * @param {String[]} [argv=process.argv]
 * @returns {Promise<Object>}
 */
export async function main(argv = process.argv) {
    const program = new Command();

    program
        .name('theme-release-compare')
        .requiredOption('--tree <dir>', 'a git-archive export of dev with its themes and browser bundles built')
        .requiredOption('--out <dir>', 'where frames and the report are written')
        .option('--released <url>', 'the released site', 'https://neomjs.com')
        .option('--surfaces <list>', 'comma-separated surfaces, e.g. examples/dialog (default: every theme-Neo surface)')
        .option('--per-group <n>', 'elements compared per group', '6')
        .option('--settle-ms <n>', 'wait after the first render before reading', '1500')
        .option('--timeout-ms <n>', 'per-page load timeout', '30000')
        .parse(argv);

    const opts = program.opts();

    return runReleaseCompare({
        tree     : opts.tree,
        out      : opts.out,
        released : opts.released.replace(/\/$/, ''),
        surfaces : opts.surfaces?.split(',').map(entry => entry.trim()).filter(Boolean),
        perGroup : Number(opts.perGroup),
        settleMs : Number(opts.settleMs),
        timeoutMs: Number(opts.timeoutMs)
    })
}

if (isEntryModule(import.meta.url)) {
    main().catch(error => {
        console.error(error);
        process.exit(1)
    })
}
