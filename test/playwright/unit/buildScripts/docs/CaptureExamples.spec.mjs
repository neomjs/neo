import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import {execFileSync}  from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
    applyTileTheme, fitTileRegion, validateCaptureRecipes, selectCaptureRecipes, selectTiles
} from '../../../../../buildScripts/docs/captureExamples.mjs';

/** @summary Gives the producer one covered local record and an unrelated legacy cover. */
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
    return valid.recipes.filter(recipe => recipe.landing).map(recipe => recipe.id)
}

test('a covered record without a recipe is captured from the frame a visitor lands on, with no input of its own', () => {
    const records = catalog();
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual([]);
    records.push({id: 'grid-two', family: 'grid-table', name: 'Grid two', image: 'grid-two.jpg', urls: {devmode: 'examples/grid/two/'}});
    const entry = validateCaptureRecipes(manifest(), records).recipes.find(recipe => recipe.id === 'grid-two');
    expect(entry).toEqual({
        id      : 'grid-two', landing: true, family: 'grid-table', name: 'Grid two', url: 'examples/grid/two/?theme=neo-theme-neo-dark',
        viewport: {width: 960, height: 540}, theme: 'dark', state: 'The frame a visitor lands on.',
        ready   : [], steps: [], after: [], region: 'viewport'
    });
    expect(selectCaptureRecipes(validateCaptureRecipes(manifest(), records), {record: 'grid-two'})).toEqual([entry])
});

test('a landing capture opens the record\'s link as the dark catalog does, keeping its query and hash', () => {
    const records = [...catalog(), {id: 'grid-three', family: 'grid-table', image: 'grid-three.jpg', urls: {devmode: 'examples/grid/three/index.html?rows=50&theme=neo-theme-neo-light#/start'}}],
        entry     = validateCaptureRecipes(manifest(), records).recipes.find(recipe => recipe.id === 'grid-three');
    expect(entry.url).toBe('examples/grid/three/index.html?rows=50&theme=neo-theme-neo-dark#/start')
});

test('an external-origin covered record gets no landing capture, a same-origin one does', () => {
    const records = [...catalog(), {id: 'external-app', family: 'grid-table', image: 'external.png', urls: {devmode: 'https://neomjs.com/devindex/'}}];
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual([]);
    records.push({id: 'local-app', family: 'grid-table', image: 'local.png', urls: {devmode: 'apps/local/index.html'}});
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual(['local-app'])
});

test('a tile in a covered family takes no landing capture, a card beside it does', () => {
    const records = [...catalog(), {id: 'grid-tile', kind: 'component', family: 'grid-table', image: 'devmode/tiles/grid-tile-14.jpg', urls: {devmode: 'examples/grid/tile/index.html'}}];
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual([]);
    records.push({id: 'grid-card', family: 'grid-table', image: 'grid-card.jpg', urls: {devmode: 'examples/grid/card/index.html'}});
    expect(landingIds(validateCaptureRecipes(manifest(), records))).toEqual(['grid-card'])
});

test('a further family joins the covered families explicitly, and a recipe replaces a record\'s landing capture', () => {
    const raw = manifest(); raw.families.push('forms');
    expect(landingIds(validateCaptureRecipes(raw, catalog()))).toEqual(['form-one']);
    raw.recipes.push({...structuredClone(raw.recipes[0]), id: 'form-one'});
    const valid = validateCaptureRecipes(raw, catalog());
    expect(valid.recipes).toHaveLength(2);
    expect(landingIds(valid)).toEqual([])
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

test('the committed Grid/Table manifest covers every current family record with a real feature action', () => {
    const data  = new URL('../../../../../apps/portal/resources/data/', import.meta.url),
        records = JSON.parse(fs.readFileSync(new URL('examples.json', data))),
        raw     = JSON.parse(fs.readFileSync(new URL('../../../../../buildScripts/docs/captureExamples.json', import.meta.url))),
        valid   = validateCaptureRecipes(raw, records), rows = selectCaptureRecipes(valid, {family: 'grid-table'});
    expect(rows.map(row => row.id).sort()).toEqual(records.filter(row => row.family === 'grid-table' && row.image).map(row => row.id).sort());
    expect(rows.every(row => row.steps.length > 0 && row.after.length > 0)).toBe(true)
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

test('the committed tile list names workbench entries that exist', () => {
    const data = new URL('../../../../../apps/portal/resources/data/', import.meta.url),
        valid  = validateCaptureRecipes(JSON.parse(fs.readFileSync(new URL('../../../../../buildScripts/docs/captureExamples.json', import.meta.url))), JSON.parse(fs.readFileSync(new URL('examples.json', data))));
    expect(valid.tiles.length).toBeGreaterThan(0);
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

test('a tile takes the preferred dark theme a workbench offers, clicking only while it is inactive', async () => {
    for (const [offered, active, theme, clicks] of [
        [['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-light'], 'neo-theme-light', 'neo-theme-dark', 1],     // the engine default
        [['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-dark'],  'neo-theme-light', 'neo-theme-neo-dark', 2], // neo-dark wins
        [['neo-theme-dark'],                                           'neo-theme-dark',  'neo-theme-dark', 0]      // its only theme, already on
    ]) {
        const fake = themeSwitch(offered, active);
        expect(await applyTileTheme(offered, fake.themeOf, fake.next), offered.join()).toBe(theme);
        expect(fake.state.clicks, offered.join()).toBe(clicks)
    }
    const light = themeSwitch(['neo-theme-light'], 'neo-theme-light');
    await expect(applyTileTheme(['neo-theme-light'], light.themeOf, light.next)).rejects.toThrow(/offers no dark theme/);
    await expect(applyTileTheme(undefined, light.themeOf, light.next)).rejects.toThrow(/reports no themes/)
});
