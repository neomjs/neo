import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import {execFileSync}  from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
    applyTileTheme, fitTileRegion, networkQuiet, pairTileRegion, validateCaptureRecipes, selectCaptureRecipes, selectTiles, viewMounted,
    writePair
} from '../../../../../buildScripts/docs/captureExamples.mjs';
import os                   from 'node:os';
import path                 from 'node:path';
import {readExampleCatalog} from '../../../../../buildScripts/util/exampleCatalog.mjs';

/** @summary Gives the producer one covered local record with a recipe, and one in a family no recipe covers. */
function catalog() {
    return [
        {id: 'grid-one', family: 'grid-table', name: 'Grid one', image: 'legacy-grid.jpg', urls: {devmode: 'examples/grid/one/index.html'}},
        {id: 'form-one', family: 'forms', name: 'Form one', image: 'legacy-form.jpg', urls: {devmode: 'examples/form/one/index.html'}}
    ]
}

/** @summary Supplies an explicit feature action, readiness checks and fixed device-pixel framing. */
function manifest() {
    return {version: 1, families: ['grid-table'], suffix: '14', recipes: [{
        id   : 'grid-one', viewport: {width: 1280, height: 720}, theme: 'default', state: 'An open editor',
        ready: [{selector: '.grid-row'}], steps: [{kind: 'dblclick', selector: '.country-cell'}],
        after: [{selector: '.editor'}], region: {x: 0, y: 0, width: 640, height: 360}
    }]}
}

test('capture identity and URL come from the catalog without mutating either input', () => {
    const raw  = manifest(), records = catalog(), before = structuredClone({raw, records}),
        result = validateCaptureRecipes(raw, records);
    expect(result.recipes[0]).toMatchObject({id: 'grid-one', family: 'grid-table', name: 'Grid one', url: 'examples/grid/one/index.html'});
    result.recipes[0].viewport.width = 999;
    expect({raw, records}).toEqual(before)
});

/** @summary The ids of the validated entries that capture their record's landing frame. */
function landingIds(valid) {
    return [...new Set(valid.recipes.filter(recipe => recipe.landing).map(recipe => recipe.id))]
}

test('a covered record without a recipe is captured from the frame a visitor lands on, dark and light, with no input of its own', () => {
    const records = catalog();
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual(['form-one']);
    records.push({id: 'grid-two', family: 'grid-table', name: 'Grid two', image: 'grid-two.jpg', urls: {devmode: 'examples/grid/two/'}});
    const entries = validateCaptureRecipes(manifest(), records).recipes.filter(recipe => recipe.id === 'grid-two'),
          landing = {
              id   : 'grid-two', landing: true, family: 'grid-table', name: 'Grid two', viewport: {width: 960, height: 540},
              state: 'The frame a visitor lands on.', ready: [], steps: [], after: [], region: 'viewport'
          };
    // Each pass asks for the Neo theme and accepts the legacy one of its scheme, never a theme of the other scheme
    expect(entries).toEqual([
        {...landing, url: 'examples/grid/two/?theme=neo-theme-neo-dark',  theme: 'dark',    variant: '',       accepts: ['neo-theme-neo-dark',  'neo-theme-dark']},
        {...landing, url: 'examples/grid/two/?theme=neo-theme-neo-light', theme: 'default', variant: '-light', accepts: ['neo-theme-neo-light', 'neo-theme-light']}
    ]);
    expect(selectCaptureRecipes(validateCaptureRecipes(manifest(), records), {record: 'grid-two'})).toEqual(entries)
});

test('a landing capture opens the record\'s link as the catalog in each theme does, keeping its query and hash', () => {
    const records = [...catalog(), {id: 'grid-three', family: 'grid-table', image: 'grid-three.jpg', urls: {devmode: 'examples/grid/three/index.html?rows=50&theme=neo-theme-neo-light#/start'}}],
        urls      = validateCaptureRecipes(manifest(), records).recipes.filter(recipe => recipe.id === 'grid-three').map(recipe => recipe.url);
    expect(urls).toEqual([
        'examples/grid/three/index.html?rows=50&theme=neo-theme-neo-dark#/start',
        'examples/grid/three/index.html?rows=50&theme=neo-theme-neo-light#/start'
    ])
});

test('an external-origin covered record gets no landing capture, a same-origin one does', () => {
    const records = [...catalog(), {id: 'external-app', family: 'grid-table', image: 'external.png', urls: {devmode: 'https://neomjs.com/devindex/'}}];
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual(['form-one']);
    records.push({id: 'local-app', family: 'grid-table', image: 'local.png', urls: {devmode: 'apps/local/index.html'}});
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual(['form-one', 'local-app'])
});

test('a tile in a covered family takes no landing capture, a card beside it does', () => {
    const records = [...catalog(), {id: 'grid-tile', kind: 'component', family: 'grid-table', image: 'devmode/tiles/grid-tile-14.jpg', urls: {devmode: 'examples/grid/tile/index.html'}}];
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual(['form-one']);
    records.push({id: 'grid-card', family: 'grid-table', image: 'grid-card.jpg', urls: {devmode: 'examples/grid/card/index.html'}});
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual(['form-one', 'grid-card'])
});

test('a card in a family no recipe covers is captured by --record alone; a recipe needs a declared family and replaces it', () => {
    const valid = validateCaptureRecipes(manifest(), catalog());
    expect(selectCaptureRecipes(valid, {record: 'form-one'})).toMatchObject([
        {id: 'form-one', landing: true, family: 'forms', variant: ''}, {id: 'form-one', landing: true, family: 'forms', variant: '-light'}
    ]);
    // A bulk run keeps to the declared families
    expect(selectCaptureRecipes(valid).map(recipe => recipe.id)).toEqual(['grid-one']);
    expect(() => selectCaptureRecipes(valid, {family: 'forms'})).toThrow(/no matching capture recipes/);
    const raw = manifest(); raw.recipes.push({...structuredClone(raw.recipes[0]), id: 'form-one'});
    expect(() => validateCaptureRecipes(raw, catalog())).toThrow(/outside declared families/);
    raw.families.push('forms');
    const recipes = validateCaptureRecipes(raw, catalog());
    expect(recipes.recipes).toHaveLength(2);
    expect(landingIds(recipes)).toEqual([])
});

test('a landing capture refuses a catalog id that cannot name its cover file, as a recipe does', () => {
    const records = [...catalog(), {id: '../grid', family: 'grid-table', image: 'grid.jpg', urls: {devmode: 'examples/grid/up/index.html'}}];
    expect(() => validateCaptureRecipes(manifest(), records)).toThrow(/catalog\.\.\.\/grid\.id: expected a filename-safe catalog id/)
});

/** @summary A document whose `<body>` holds `nodes` (`{tagName, style, box}`) in a 960×540 frame. */
function frameDocument(nodes) {
    const children = nodes.map(({tagName='DIV', style={}, box}) => ({tagName, style, getBoundingClientRect: () => box}));
    return {body: {children}, defaultView: {innerWidth: 960, innerHeight: 540, getComputedStyle: node => ({display: 'block', visibility: 'visible', ...node.style})}}
}

test('a view counts as mounted once a shown element covers part of the frame; a theme, a script and the measuring nodes do not', () => {
    const script = {tagName: 'SCRIPT', box: {left: 0, top: 0, right: 0, bottom: 0}},
        probe    = {style: {visibility: 'hidden'}, box: {left: 0, top: 0, right: 1, bottom: 1}},
        parked   = {box: {left: -10000, top: -10000, right: -9900, bottom: -9980}},
        view     = {box: {left: 0, top: 0, right: 960, bottom: 540}};
    expect(viewMounted(frameDocument([script]))).toBe(false);
    expect(viewMounted(frameDocument([script, probe, parked]))).toBe(false);
    expect(viewMounted(frameDocument([script, {...view, style: {display: 'none'}}]))).toBe(false);
    expect(viewMounted(frameDocument([script, probe, parked, view]))).toBe(true)
});

test('a pair is written whole or not at all: a failed second write leaves no first image, and a file the run did not create stays', async () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-pair-')),
        shots    = [{image: 'dark.jpg', bytes: Buffer.from('d')}, {image: 'light.jpg', bytes: Buffer.from('l')}];

    try {
        await writePair(output, shots);
        expect(fs.readdirSync(output).sort()).toEqual(['dark.jpg', 'light.jpg']);

        const failing = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-pair-'));
        let   opens   = 0;

        // The second exclusive open succeeds and its write fails: both files this call opened go
        await expect(writePair(failing, shots, async (file, flags) => {
            const handle = await fs.promises.open(file, flags);
            if (++opens === 2) return {writeFile: async () => {await handle.writeFile('partial'); throw new Error('I/O error')}, close: () => handle.close()};
            return handle
        })).rejects.toThrow('I/O error');
        expect(fs.readdirSync(failing)).toEqual([]);

        // The second open fails for a reason other than EEXIST: that path was never this call's and stays, the dark file goes
        fs.writeFileSync(path.join(failing, 'light.jpg'), 'foreign');
        opens = 0;
        await expect(writePair(failing, shots, async (file, flags) => {
            if (++opens === 2) throw Object.assign(new Error('permission denied'), {code: 'EACCES'});
            return fs.promises.open(file, flags)
        })).rejects.toThrow('permission denied');
        expect(fs.readdirSync(failing)).toEqual(['light.jpg']);
        expect(fs.readFileSync(path.join(failing, 'light.jpg'), 'utf8')).toBe('foreign');

        // A light file from an earlier run fails the real exclusive open: the old file stays, the dark file this call created goes
        await expect(writePair(failing, shots)).rejects.toThrow(/EEXIST/);
        expect(fs.readdirSync(failing)).toEqual(['light.jpg']);
        expect(fs.readFileSync(path.join(failing, 'light.jpg'), 'utf8')).toBe('foreign');
        fs.rmSync(failing, {recursive: true, force: true})
    } finally {
        fs.rmSync(output, {recursive: true, force: true})
    }
});

test('duplicate recipes and unknown catalog identities are refused', () => {
    const duplicate = manifest(); duplicate.recipes.push(structuredClone(duplicate.recipes[0]));
    expect(() => validateCaptureRecipes(duplicate, catalog())).toThrow(/duplicate recipe/i);
    const unknown = manifest(); unknown.recipes[0].id = 'missing';
    expect(() => validateCaptureRecipes(unknown, catalog())).toThrow(/unknown catalog/i)
});

test('a second URL registry and executable recipe strings are not admitted', () => {
    const alternate = manifest(); alternate.recipes[0].url = 'https://elsewhere.example/';
    expect(() => validateCaptureRecipes(alternate, catalog())).toThrow(/url.*unknown|unknown field/i);
    const executable = manifest(); executable.recipes[0].steps = [{kind: 'evaluate', selector: 'body', value: 'doSomething()'}];
    expect(() => validateCaptureRecipes(executable, catalog())).toThrow(/unsupported action/i)
});

test('a click may name its button, so a recipe can open a context menu; no other action takes one', () => {
    const right = manifest(); right.recipes[0].steps = [{kind: 'click', selector: '.file', button: 'right'}];
    expect(validateCaptureRecipes(right, catalog()).recipes[0].steps[0].button).toBe('right');
    for (const step of [{kind: 'click', selector: '.file', button: 'middle'}, {kind: 'dblclick', selector: '.file', button: 'right'}]) {
        const invalid = manifest(); invalid.recipes[0].steps = [step];
        expect(() => validateCaptureRecipes(invalid, catalog())).toThrow(/button/i)
    }
});

test('unsafe output identities and unsupported frame dimensions refuse before capture', () => {
    const suffix = manifest(); suffix.suffix = '../other';
    expect(() => validateCaptureRecipes(suffix, catalog())).toThrow(/suffix/i);
    const region = manifest(); region.recipes[0].region.width = 639;
    expect(() => validateCaptureRecipes(region, catalog())).toThrow(/region/i);
    const viewport = manifest(); viewport.recipes[0].viewport.height = Infinity;
    expect(() => validateCaptureRecipes(viewport, catalog())).toThrow(/viewport/i)
});

test('full viewport capture accepts a bounded 16:9 frame', () => {
    const raw = manifest(), recipe = raw.recipes[0];
    recipe.region   = 'viewport';
    recipe.viewport = {width: 960, height: 540};
    expect(validateCaptureRecipes(raw, catalog()).recipes[0].region).toBe('viewport');
    recipe.viewport = {width: 1440, height: 810};
    expect(validateCaptureRecipes(raw, catalog()).recipes[0].viewport).toEqual(recipe.viewport);

    for (const viewport of [{width: 960, height: 541}, {width: 320, height: 180}, {width: 1600, height: 900}]) {
        recipe.viewport = viewport;
        expect(() => validateCaptureRecipes(raw, catalog())).toThrow(/viewport.*16:9/)
    }
});

test('distinct-height checks require at least two finite integer heights', () => {
    const valid = manifest(); valid.recipes[0].after[0].minDistinctHeights = 2;
    expect(validateCaptureRecipes(valid, catalog()).recipes[0].after[0].minDistinctHeights).toBe(2);
    for (const minDistinctHeights of [1, NaN]) {
        const invalid = manifest(); invalid.recipes[0].after[0].minDistinctHeights = minDistinctHeights;
        expect(() => validateCaptureRecipes(invalid, catalog())).toThrow(/minDistinctHeights.*integer/i)
    }
});

test('capture-region checks accept explicit booleans without coercing other values', () => {
    for (const inRegion of [true, false]) {
        const valid = manifest(); valid.recipes[0].after[0].inRegion = inRegion;
        expect(validateCaptureRecipes(valid, catalog()).recipes[0].after[0].inRegion).toBe(inRegion)
    }
    for (const inRegion of ['true', 'false', 1, null]) {
        const invalid = manifest(); invalid.recipes[0].after[0].inRegion = inRegion;
        expect(() => validateCaptureRecipes(invalid, catalog())).toThrow(/inRegion.*boolean/i)
    }
});

test('selection supports one record, one family or all and refuses empty or conflicting requests', () => {
    const raw   = manifest(); raw.families.push('forms'); raw.recipes.push({...structuredClone(raw.recipes[0]), id: 'form-one'});
    const valid = validateCaptureRecipes(raw, catalog());
    expect(selectCaptureRecipes(valid).map(row => row.id)).toEqual(['grid-one', 'form-one']);
    expect(selectCaptureRecipes(valid, {record: 'form-one'}).map(row => row.id)).toEqual(['form-one']);
    expect(selectCaptureRecipes(valid, {family: 'grid-table'}).map(row => row.id)).toEqual(['grid-one']);
    expect(() => selectCaptureRecipes(valid, {record: 'absent'})).toThrow(/no matching/i);
    expect(() => selectCaptureRecipes(valid, {record: 'grid-one', family: 'grid-table'})).toThrow(/not both/i)
});

test('an explicitly empty or whitespace-only record selector cannot silently capture all recipes', () => {
    const valid = validateCaptureRecipes(manifest(), catalog());
    for (const record of ['', ' ', '\t\n']) {
        expect(() => selectCaptureRecipes(valid, {record})).toThrow(/selection\.record.*nonempty/i)
    }
});

test('an explicitly empty or whitespace-only family selector cannot silently capture all recipes', () => {
    const valid = validateCaptureRecipes(manifest(), catalog());
    for (const family of ['', ' ', '\t\n']) {
        expect(() => selectCaptureRecipes(valid, {family})).toThrow(/selection\.family.*nonempty/i)
    }
});

test('the committed Grid/Table catalog selects a capture for every covered card', async () => {
    const data    = new URL('../../../../../apps/portal/resources/data/', import.meta.url),
        {records} = await readExampleCatalog(fileURLToPath(new URL('examples', data))),
        raw       = JSON.parse(fs.readFileSync(new URL('../../../../../buildScripts/docs/captureExamples.json', import.meta.url))),
        valid     = validateCaptureRecipes(raw, records),
        rows      = selectCaptureRecipes(valid, {family: 'grid-table'}),
        recipeIds = new Set(raw.recipes.map(recipe => recipe.id));

    const ids = [...new Set(rows.map(row => row.id))];

    expect(ids.sort()).toEqual(records.filter(row => row.family === 'grid-table' && row.image).map(row => row.id).sort());

    for (const id of ids) {
        const own = rows.filter(row => row.id === id);

        if (recipeIds.has(id)) {
            expect(own, id).toHaveLength(1);
            expect(own[0].steps.length, id).toBeGreaterThan(0);
            expect(own[0].after.length, id).toBeGreaterThan(0)
        } else {
            // A landing cover is shot with its light partner
            expect(own.map(row => row.variant).sort(), id).toEqual(['', '-light']);
            own.forEach(row => expect(row, id).toMatchObject({landing: true, steps: [], after: [], region: 'viewport'}))
        }
    }
});

test('the command exposes help without starting a browser or requiring a running server', () => {
    const file = fileURLToPath(new URL('../../../../../buildScripts/docs/captureExamples.mjs', import.meta.url)),
        output = execFileSync(process.execPath, [file, '--help'], {encoding: 'utf8'});
    expect(output).toContain('--record'); expect(output).toContain('--preview'); expect(output).toContain('--tiles')
});

test('a tile is named by its examples/ path, which gives its id and devmode URL', () => {
    const raw = {...manifest(), tiles: ['examples/form/field/date', 'examples/sitemap']},
        valid = validateCaptureRecipes(raw, catalog());
    expect(valid.tiles).toEqual([
        {id: 'form-field-date', path: 'examples/form/field/date', url: 'examples/form/field/date/index.html'},
        {id: 'sitemap',         path: 'examples/sitemap',         url: 'examples/sitemap/index.html'}
    ]);
    expect(selectTiles(valid, 'examples/sitemap').map(tile => tile.id)).toEqual(['sitemap']);
    expect(validateCaptureRecipes(manifest(), catalog()).tiles).toEqual([])
});

test('a component record the frozen list does not name is a tile at its own size, after the listed ones', () => {
    const records = [...catalog(),
        {id: 'split', kind: 'component', family: 'buttons', image: 'devmode/tiles/button-split-14.jpg', sourceUrl: 'examples/button/split', urls: {devmode: 'examples/button/split/index.html'}},
        {id: 'date',  kind: 'component', family: 'forms',   image: 'devmode/tiles/form-field-date-14.jpg', sourceUrl: 'examples/form/field/date', urls: {devmode: 'examples/form/field/date/index.html'}}
    ],
        valid = validateCaptureRecipes({...manifest(), tiles: [{path: 'examples/form/field/date', width: 220}]}, records);
    expect(valid.tiles).toEqual([
        {id: 'form-field-date', path: 'examples/form/field/date', url: 'examples/form/field/date/index.html', width: 220},
        {id: 'button-split',    path: 'examples/button/split',    url: 'examples/button/split/index.html'}
    ]);
    expect(selectTiles(valid, 'examples/button/split').map(tile => tile.id)).toEqual(['button-split']);
    records.push({id: 'bad', kind: 'component', family: 'forms', sourceUrl: 'apps/form'});
    expect(() => validateCaptureRecipes(manifest(), records)).toThrow(/catalog\.bad\.sourceUrl/)
});

test('a tile entry may name the size its component takes for the capture', () => {
    const raw = {...manifest(), tiles: [{path: 'examples/form/field/text', width: 220}, {path: 'examples/sitemap', width: 320, height: 240}, 'examples/form/field/date']},
        valid = validateCaptureRecipes(raw, catalog());
    expect(valid.tiles).toEqual([
        {id: 'form-field-text', path: 'examples/form/field/text', url: 'examples/form/field/text/index.html', width: 220},
        {id: 'sitemap',         path: 'examples/sitemap',         url: 'examples/sitemap/index.html',         width: 320, height: 240},
        {id: 'form-field-date', path: 'examples/form/field/date', url: 'examples/form/field/date/index.html'}
    ]);
    expect(selectTiles(valid, 'examples/form/field/text')[0].width).toBe(220)
});

test('a tile path outside examples/, a duplicate tile, a bad capture size or an unknown selection is refused', () => {
    for (const tiles of [
        ['apps/form'], ['examples/'], ['examples/../apps'], ['examples/sitemap', 'examples/sitemap'],
        [{path: 'examples/sitemap', width: 79}], [{path: 'examples/sitemap', height: 641}], [{path: 'examples/sitemap', width: 220.5}],
        [{path: 'examples/sitemap', zoom: 2}], [{width: 220}], ['examples/sitemap', {path: 'examples/sitemap', width: 220}]
    ]) {
        expect(() => validateCaptureRecipes({...manifest(), tiles}, catalog())).toThrow(/manifest\.tiles/)
    }
    const valid = validateCaptureRecipes({...manifest(), tiles: ['examples/sitemap']}, catalog());
    expect(() => selectTiles(valid, 'examples/form/field/date')).toThrow(/no matching tiles/)
});

test('the committed tile list names workbench entries that exist', async () => {
    const data = new URL('../../../../../apps/portal/resources/data/', import.meta.url),
        valid  = validateCaptureRecipes(JSON.parse(fs.readFileSync(new URL('../../../../../buildScripts/docs/captureExamples.json', import.meta.url))), (await readExampleCatalog(fileURLToPath(new URL('examples', data)))).records);
    expect(valid.tiles.length).toBeGreaterThan(0);
    expect(selectTiles(valid, 'examples/component/video')).toEqual([
        {id: 'component-video', path: 'examples/component/video', url: 'examples/component/video/index.html'}
    ]);
    expect(selectTiles(valid, 'examples/tree')).toEqual([
        {id: 'tree', path: 'examples/tree', url: 'examples/tree/index.html'}
    ]);
    expect(selectTiles(valid, 'examples/treeAccordion')).toEqual([
        {id: 'treeAccordion', path: 'examples/treeAccordion', url: 'examples/treeAccordion/index.html'}
    ]);
    for (const tile of valid.tiles) {
        const source = fs.readFileSync(new URL(`../../../../../${tile.path}/MainContainer.mjs`, import.meta.url), 'utf8');
        // A field entry extends the workbench through its states template
        expect(source, tile.path).toMatch(/ConfigurationViewport|StatesViewport/)
    }
});

/** @summary Whether box `outer` ({x, y, width, height}) holds box `inner` ({left, top, right, bottom}). */
function holds(outer, inner) {
    return outer.x <= inner.left && outer.y <= inner.top && outer.x + outer.width >= inner.right && outer.y + outer.height >= inner.bottom
}

test('a tile region holds its component inside the stage, giving up padding before content', () => {
    const stage = {x: 300, y: 100, width: 1000, height: 700};
    for (const content of [
        {left: 686, top: 364.5, right: 914, bottom: 535.5}, // a compact control, mid-stage
        {left: 300, top: 100,   right: 400, bottom: 160},   // in the stage's corner
        {left: 340, top: 300,   right: 1260, bottom: 500}   // fits the 933 px wide 4:3 maximum only without padding
    ]) {
        const region = fitTileRegion(content, stage);
        expect(holds(region, content), JSON.stringify(content)).toBe(true);
        expect(holds({...stage}, {left: region.x, top: region.y, right: region.x + region.width, bottom: region.y + region.height})).toBe(true);
        expect(region.width / region.height).toBeCloseTo(4 / 3, 1)
    }
});

test('a tile refuses a blank stage and a component no tile-aspect region inside the stage can hold', () => {
    const stage = {x: 0, y: 0, width: 500, height: 600};
    expect(() => fitTileRegion(null, stage)).toThrow(/renders nothing/);
    expect(() => fitTileRegion({left: 10, top: 10, right: 14, bottom: 14}, stage)).toThrow(/renders nothing/);
    // A 4:3 region inside a 500 × 600 stage is at most 500 × 375: a 562 px tall component would lose its top and bottom
    expect(() => fitTileRegion({left: 139, top: 19, right: 361, bottom: 581}, stage)).toThrow(/222×562 component does not fit/)
});

test('a tile pair shares one region: both themes\' content, inside the stage both themes show', () => {
    const stage = {x: 300, y: 100, width: 1000, height: 700},
        dark    = {left: 700, top: 400, right: 900, bottom: 500},
        light   = {left: 690, top: 405, right: 930, bottom: 498}, // a light theme that draws the control wider
        region  = pairTileRegion([{content: dark, stage}, {content: light, stage}]);
    expect(holds(region, dark)).toBe(true);
    expect(holds(region, light)).toBe(true);
    expect(region).toEqual(fitTileRegion({left: 690, top: 400, right: 930, bottom: 500}, stage));
    // A stage that moves between themes leaves the region only the area both show: alone, the dark stage would start it at 300
    const corner = {left: 330, top: 120, right: 410, bottom: 180};
    expect(pairTileRegion([{content: corner, stage}]).x).toBe(300);
    expect(pairTileRegion([{content: corner, stage}, {content: {...corner, right: 420}, stage: {...stage, x: 320}}]).x).toBe(320);
    expect(() => pairTileRegion([{content: dark, stage}, {content: null, stage}])).toThrow(/renders nothing/)
});

/** @summary A theme switch like the workbench's: a click shows the next offered theme; with nothing else to show, it times out. */
function themeSwitch(offered, active) {
    const state = {clicks: 0, index: offered.indexOf(active)};
    return {
        state,
        themeOf: async () => offered[state.index],
        next   : async () => {
            state.clicks++;
            if (offered.length < 2) throw new Error('the theme never changed');
            state.index = (state.index + 1) % offered.length
        }
    }
}

test('a tile takes the preferred theme of each pass a workbench offers, clicking only while it is inactive', async () => {
    for (const [scheme, offered, active, theme, clicks] of [
        ['dark',  ['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-light'], 'neo-theme-light', 'neo-theme-dark', 1],      // the engine default
        ['dark',  ['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-dark'],  'neo-theme-light', 'neo-theme-neo-dark', 2],  // neo-dark wins
        ['dark',  ['neo-theme-dark'],                                           'neo-theme-dark',  'neo-theme-dark', 0],      // its only theme, already on
        ['light', ['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-light'], 'neo-theme-dark',  'neo-theme-neo-light', 1], // neo-light wins
        ['light', ['neo-theme-light', 'neo-theme-dark'],                        'neo-theme-dark',  'neo-theme-light', 1]      // the legacy partner
    ]) {
        const fake = themeSwitch(offered, active);
        expect(await applyTileTheme(offered, scheme, fake.themeOf, fake.next), offered.join()).toBe(theme);
        expect(fake.state.clicks, offered.join()).toBe(clicks)
    }
    const light = themeSwitch(['neo-theme-light'], 'neo-theme-light'), dark = themeSwitch(['neo-theme-dark'], 'neo-theme-dark');
    await expect(applyTileTheme(['neo-theme-light'], 'dark', light.themeOf, light.next)).rejects.toThrow(/offers no dark theme/);
    await expect(applyTileTheme(['neo-theme-dark'], 'light', dark.themeOf, dark.next)).rejects.toThrow(/offers no light theme/);
    await expect(applyTileTheme(undefined, 'dark', light.themeOf, light.next)).rejects.toThrow(/reports no themes/)
});

const workerUrl = 'http://127.0.0.1/src/worker/App.mjs';

/**
 * @summary A ledger as {@link trackNetwork} keeps it, settled half a second ago
 * @param {String[]} pending The URLs of the open requests, as Playwright reports them
 * @param {String[]} [startups=[]] The URLs of the requests Chromium names a SharedWorker's start-up
 * @returns {Object}
 */
const ledger = (pending, startups=[]) => ({
    lastActivity: Date.now() - 1000,
    pending     : new Set(pending.map(url => ({url: () => url}))),
    startups    : new Map(startups.map((url, index) => [`cdp-${index}`, url]))
});

test('the network counts as quiet past a SharedWorker start-up Chromium names for a worker the browser runs', async () => {
    expect(await networkQuiet(ledger([workerUrl], [workerUrl]), async () => [workerUrl], 1000)).toEqual([workerUrl])
});

test('a request that shares a worker\'s URL without starting it keeps the network waiting, and the timeout names both', async () => {
    await expect(networkQuiet(ledger([workerUrl, workerUrl], [workerUrl]), async () => [workerUrl], 300)).rejects.toThrow(
        `landing: the network never went quiet; open: ${workerUrl}; SharedWorker start-up scripts not waited for: ${workerUrl}`
    )
});

test('a start-up Chromium names keeps the network waiting while no such worker runs, and so does an ordinary request', async () => {
    await expect(networkQuiet(ledger([workerUrl], [workerUrl]), async () => [], 300)).rejects.toThrow(`open: ${workerUrl};`);
    await expect(networkQuiet(ledger(['http://127.0.0.1/held.json']), async () => [workerUrl], 300)).rejects.toThrow('open: http://127.0.0.1/held.json;')
});

test('the network goes quiet only after half a second without a request', async () => {
    const started = Date.now();

    await networkQuiet({...ledger([]), lastActivity: started}, async () => []);
    expect(Date.now() - started).toBeGreaterThanOrEqual(400)
});
