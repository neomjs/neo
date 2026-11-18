import {test, expect}                                 from '@playwright/test';
import fs                                             from 'node:fs';
import {execFileSync}                                 from 'node:child_process';
import {fileURLToPath}                                from 'node:url';
import {validateCaptureRecipes, selectCaptureRecipes} from '../../../../../buildScripts/docs/captureExamples.mjs';

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

test('a covered record without a recipe fails inside the migrated family, while other legacy families stay independent', () => {
    const records = catalog();
    expect(() => validateCaptureRecipes(manifest(), records)).not.toThrow();
    records.push({id: 'grid-two', family: 'grid-table', image: 'grid-two.jpg', urls: {devmode: 'examples/grid/two/'}});
    expect(() => validateCaptureRecipes(manifest(), records)).toThrow(/image|recipe/i)
});

test('an external demo keeps its cover without a recipe, and a recipe for one is refused', () => {
    const records = catalog(), raw = manifest();
    records.push({id: 'grid-demo', family: 'grid-table', image: 'grid-demo.png', urls: {devmode: 'https://example.org/demo/index.html'}});
    expect(validateCaptureRecipes(raw, records).recipes).toHaveLength(1);
    raw.recipes.push({...structuredClone(raw.recipes[0]), id: 'grid-demo'});
    expect(() => validateCaptureRecipes(raw, records)).toThrow(/external demo/i)
});

test('a further family joins the coverage guard explicitly', () => {
    const raw = manifest(); raw.families.push('forms');
    expect(() => validateCaptureRecipes(raw, catalog())).toThrow(/form-one.*image|recipe/i);
    raw.recipes.push({...structuredClone(raw.recipes[0]), id: 'form-one'});
    expect(validateCaptureRecipes(raw, catalog()).recipes).toHaveLength(2)
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

test('unsafe output identities and unsupported frame dimensions refuse before capture', () => {
    const suffix = manifest(); suffix.suffix = '../other';
    expect(() => validateCaptureRecipes(suffix, catalog())).toThrow(/suffix/i);
    const region = manifest(); region.recipes[0].region.width = 639;
    expect(() => validateCaptureRecipes(region, catalog())).toThrow(/region/i);
    const viewport = manifest(); viewport.recipes[0].viewport.height = Infinity;
    expect(() => validateCaptureRecipes(viewport, catalog())).toThrow(/viewport/i)
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
        raw     = JSON.parse(fs.readFileSync(new URL('example-captures.json', data))),
        valid   = validateCaptureRecipes(raw, records), rows = selectCaptureRecipes(valid, {family: 'grid-table'});
    expect(rows.map(row => row.id).sort()).toEqual(records.filter(row => row.family === 'grid-table').map(row => row.id).sort());
    expect(rows.every(row => row.steps.length > 0 && row.after.length > 0)).toBe(true)
});

test('the command exposes help without starting a browser or requiring a running server', () => {
    const file = fileURLToPath(new URL('../../../../../buildScripts/docs/captureExamples.mjs', import.meta.url)),
        output = execFileSync(process.execPath, [file, '--help'], {encoding: 'utf8'});
    expect(output).toContain('--record'); expect(output).toContain('--preview')
});
