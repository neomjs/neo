/**
 * @module buildScripts/util/theme-release-compare
 * @summary Compares a built `dev` tree's theme-Neo surfaces with the released site, page by page, by computed style.
 *
 * `theme-equality` and the visual goldens both compare against `dev`, so a defect `dev` already carries
 * passes both. This runner loads each surface twice: from the released site, with a desktop Chrome user
 * agent (neomjs.com answers other agents with a scriptless prerender), and from a built tree served on
 * loopback. It does so in every theme Neo scheme the surface lists. Per surface and scheme it saves both
 * whole-viewport frames and compares the computed styles of a fixed element set. Each differing property
 * is reported with both values and with the element's custom properties that resolve to the `dev` value,
 * which names the variable or role a verdict has to cite.
 *
 * The tree must be a git-archive export with `npm run build-themes -- -n -e dev -t all` run inside it, never
 * the working checkout, so no stale `dist` file can stand in for a deleted sheet.
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
 * @summary Whether two normalized `rgba()` values differ by no more than a palette re-tint no reader sees:
 * at most 6 per channel and 0.02 in alpha. The neutral ramps moved hue between releases (`#0e0f0d` → `#0e0f13`),
 * and reporting each such pair would bury the moves that change what a reader sees.
 * @param {String} a
 * @param {String} b
 * @returns {Boolean}
 */
export function nearSameColor(a, b) {
    const parse = value => value?.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/)?.slice(1).map(Number),
          x     = parse(a),
          y     = parse(b);

    return Boolean(x && y) && x.slice(0, 3).every((channel, i) => Math.abs(channel - y[i]) <= 6) && Math.abs(x[3] - y[3]) <= 0.02
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
 * @summary Orders the custom properties that resolve to a `dev` value: roles first, then the element's own
 * component variables, then palette grades, then the rest, so a verdict reads the owner before a coincidence.
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
 * @summary Pairs the released and `dev` element snapshots of one surface and scheme by key and lists every
 * property whose value differs, plus the elements present on one side only. A border color is skipped when
 * neither side draws that border.
 * @param {Object[]} released `{key, group, values, vars}` from the released page.
 * @param {Object[]} dev The same from the `dev` page.
 * @returns {Object[]} `{key, group, property, released, dev, candidates}`; a one-sided element reports
 * `property: '(element)'` with `missing` as the absent side's value.
 */
export function diffSnapshots(released, dev) {
    const devByKey = new Map(dev.map(item => [item.key, item])),
          seen     = new Set(),
          rows     = [];

    for (const item of released) {
        const match = devByKey.get(item.key);
        seen.add(item.key);

        if (!match) {
            rows.push({key: item.key, group: item.group, property: '(element)', released: 'present', dev: 'missing', candidates: []});
            continue
        }

        for (const property of PROPERTIES) {
            if (item.values[property] === match.values[property] || nearSameColor(item.values[property], match.values[property])) continue;
            if (property === 'border-top-color' && drawsNoBorder(item.values) && drawsNoBorder(match.values)) continue;

            const names = (match.vars || []).filter(entry => entry.value === match.values[property]).map(entry => entry.name);

            rows.push({
                key       : item.key,
                group     : item.group,
                property,
                released  : item.values[property],
                dev       : match.values[property],
                candidates: rankCandidates(names, item.group).slice(0, 4)
            })
        }
    }

    for (const item of dev) {
        if (!seen.has(item.key)) {
            rows.push({key: item.key, group: item.group, property: '(element)', released: 'missing', dev: 'present', candidates: []})
        }
    }

    return rows
}

/**
 * @summary Renders the run as Markdown for the release gate: totals first, then one table per surface and scheme.
 * @param {Object} result `{released, tree, runs}`, each run `{surface, scheme, rows, error}`.
 * @returns {String}
 */
export function formatReport(result) {
    const {runs}    = result,
          differing = runs.filter(run => run.rows?.length),
          failed    = runs.filter(run => run.error),
          lines     = [
              `# Released vs \`dev\``,
              '',
              `Released: ${result.released} · \`dev\` tree: \`${result.tree}\``,
              '',
              `${runs.length} runs (surface × scheme): ${differing.length} differ, ${failed.length} failed to load, ${runs.length - differing.length - failed.length} equal.`,
              ''
          ];

    for (const run of failed) {
        lines.push(`- **${run.surface}** · ${run.scheme}: ${run.error}`)
    }

    for (const run of differing) {
        lines.push('', `## ${run.surface} · ${run.scheme.replace('neo-theme-', '')}`, '',
            '| Element | Property | Released | `dev` | Resolves from |',
            '| :--- | :--- | :--- | :--- | :--- |');

        for (const row of run.rows) {
            lines.push(`| \`${row.key}\` | ${row.property} | \`${row.released}\` | \`${row.dev}\` | ${row.candidates.map(name => `\`${name}\``).join(', ')} |`)
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
 * @summary Reads the element set's computed styles in the page. Runs in the browser.
 * @param {Object} input `{elementSet, properties, perGroup}`
 * @returns {Object[]} `{key, group, values, vars}`
 */
function readElements({elementSet, properties, perGroup}) {
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
          out      = [];

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

            probe.remove()

            out.push({key: `${group}#${index}${text ? ' ' + text : ''}`, group, values, vars})
        })
    }

    return out
}

/**
 * @summary Loads one page, waits for the engine to render and settle, saves its frame and reads its elements.
 * @param {import('@playwright/test').Browser} browser
 * @param {String} url
 * @param {String} framePath
 * @param {Object} options `{perGroup, settleMs, timeoutMs}`
 * @returns {Promise<Object[]>}
 */
async function capture(browser, url, framePath, {perGroup, settleMs, timeoutMs}) {
    const page = await browser.newPage({userAgent: RELEASED_USER_AGENT, viewport: {width: 1280, height: 800}});

    try {
        await page.goto(url, {timeout: timeoutMs});
        await page.waitForFunction(() => window.Neo && document.querySelector('.neo-viewport, .neo-container'), null, {timeout: timeoutMs});
        await page.waitForTimeout(settleMs);
        await page.screenshot({path: framePath});

        return await page.evaluate(readElements, {elementSet: ELEMENT_SET, properties: PROPERTIES, perGroup})
    } finally {
        await page.close()
    }
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
                const slug = `${surface.replaceAll('/', '-')}-${scheme.replace('neo-theme-neo-', '')}`,
                      page = `/${surface}/index.html?theme=${scheme}`,
                      run  = {surface, scheme};

                try {
                    const released = await capture(browser, options.released + page, path.join(frames, `${slug}-released.png`), options),
                          dev      = await capture(browser, `http://127.0.0.1:${port}${page}`, path.join(frames, `${slug}-dev.png`), options);

                    run.rows = diffSnapshots(released, dev)
                } catch (error) {
                    run.error = error.message.split('\n')[0]
                }

                result.runs.push(run);
                console.log(`${surface} · ${scheme}: ${run.error ? 'error' : `${run.rows.length} differences`}`)
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
        .requiredOption('--tree <dir>', 'a git-archive export of dev with its themes built')
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
