import {test, expect} from '@playwright/test';

/**
 * @summary Component witness for the DOM API renderer's namespaces: an element is created in the namespace it inherits,
 * so `svg` and `math` subtrees become SVG and MathML elements, and SVG draws. The deltas are handcrafted VNodes, so every
 * arm names the path it drives: a mount under HTML, an insert into a live `<svg>`, a batched insert, a fragment, a
 * `foreignObject`, and a renamed element.
 */

const
    HTML = 'http://www.w3.org/1999/xhtml',
    MATH = 'http://www.w3.org/1998/Math/MathML',
    SVG  = 'http://www.w3.org/2000/svg';

/**
 * A VNode as the VDom worker ships it.
 * @param {String} nodeName
 * @param {String} id
 * @param {Object} [config]
 * @returns {Object}
 */
const vnode = (nodeName, id, {attributes = {}, childNodes = [], className = []} = {}) =>
    ({attributes, childNodes, className, id, nodeName, style: {}});

/**
 * Applies the deltas through the DOM API renderer and reports the namespace and the constructor of each named element.
 * @param {Object}   page
 * @param {Object[]} deltas
 * @param {String[]} ids
 * @returns {Promise<Object>}
 */
const render = (page, deltas, ids) => page.evaluate(async ({deltas, ids}) => {
    Neo.config.useDomApiRenderer = true;
    await Neo.main.DeltaUpdates.importRenderer();
    Neo.main.DeltaUpdates.update({deltas});

    return Object.fromEntries(ids.map(id => {
        const node = document.getElementById(id);
        return [id, node && {ns: node.namespaceURI, type: node.constructor.name}]
    }))
}, {deltas, ids});

const mountSvg = page => render(page, [{action: 'insertNode', parentId: 'component-test-viewport', index: 0,
    vnode: vnode('svg', 'svg-1', {attributes: {height: '100', viewBox: '0 0 10 10', width: '100'}, childNodes: [
        vnode('circle', 'circle-1', {attributes: {cx: '5', cy: '5', r: '4'}, className: ['ring']})
    ]})
}], ['svg-1', 'circle-1']);

test.describe('Neo.main.render.DomApiRenderer namespaces', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        await page.evaluate(() => {document.getElementById('component-test-viewport').innerHTML = ''})
    });

    test('an svg subtree mounted under HTML is created as SVG elements and draws', async ({page}) => {
        const result = await mountSvg(page);

        expect(result['svg-1']).toEqual({ns: SVG, type: 'SVGSVGElement'});
        expect(result['circle-1']).toEqual({ns: SVG, type: 'SVGCircleElement'});
        // A drawn circle has a geometry box; an HTMLUnknownElement has no getBBox()
        expect(await page.evaluate(() => {
            const circle = document.getElementById('circle-1');
            return typeof circle.getBBox === 'function' ? circle.getBBox().width : null
        })).toBe(8);
        expect(await page.locator('#circle-1').getAttribute('class')).toBe('ring')
    });

    test('a subtree inserted into a live svg inherits its namespace, as a component\'s <g> would', async ({page}) => {
        await mountSvg(page);

        const result = await render(page, [{action: 'insertNode', parentId: 'svg-1', index: 1,
            vnode: vnode('g', 'g-1', {childNodes: [vnode('rect', 'rect-1', {attributes: {height: '2', width: '2'}})]})
        }], ['g-1', 'rect-1']);

        expect(result['g-1']).toEqual({ns: SVG, type: 'SVGGElement'});
        expect(result['rect-1']).toEqual({ns: SVG, type: 'SVGRectElement'})
    });

    test('a batch of inserts into a live svg inherits its namespace', async ({page}) => {
        await mountSvg(page);

        // Two contiguous inserts into one parent run through insertNodeBatch
        const result = await render(page, [
            {action: 'insertNode', parentId: 'svg-1', index: 1, vnode: vnode('rect', 'rect-a')},
            {action: 'insertNode', parentId: 'svg-1', index: 2, vnode: vnode('line', 'line-b')}
        ], ['rect-a', 'line-b']);

        expect(result['rect-a']).toEqual({ns: SVG, type: 'SVGRectElement'});
        expect(result['line-b']).toEqual({ns: SVG, type: 'SVGLineElement'})
    });

    test('a fragment inside an svg passes the namespace through to its children', async ({page}) => {
        await mountSvg(page);

        const result = await render(page, [{action: 'insertNode', parentId: 'svg-1', index: 1,
            vnode: vnode('fragment', 'frag-1', {childNodes: [vnode('ellipse', 'ellipse-1')]})
        }], ['ellipse-1']);

        expect(result['ellipse-1']).toEqual({ns: SVG, type: 'SVGEllipseElement'})
    });

    test('foreignObject is SVG, and its children are HTML again', async ({page}) => {
        const result = await render(page, [{action: 'insertNode', parentId: 'component-test-viewport', index: 0,
            vnode: vnode('svg', 'svg-2', {childNodes: [
                vnode('foreignObject', 'fo-1', {childNodes: [vnode('div', 'fo-div')]})
            ]})
        }], ['fo-1', 'fo-div']);

        expect(result['fo-1']).toEqual({ns: SVG, type: 'SVGForeignObjectElement'});
        expect(result['fo-div']).toEqual({ns: HTML, type: 'HTMLDivElement'})
    });

    test('math opens the MathML namespace', async ({page}) => {
        const result = await render(page, [{action: 'insertNode', parentId: 'component-test-viewport', index: 0,
            vnode: vnode('math', 'math-1', {childNodes: [vnode('mi', 'mi-1')]})
        }], ['math-1', 'mi-1']);

        expect(result['math-1'].ns).toBe(MATH);
        expect(result['mi-1'].ns).toBe(MATH)
    });

    test('a renamed svg element stays an SVG element', async ({page}) => {
        await mountSvg(page);

        const result = await render(page, [{action: 'updateNode', id: 'circle-1', nodeName: 'rect'}], ['circle-1']);

        expect(result['circle-1']).toEqual({ns: SVG, type: 'SVGRectElement'})
    });

    test('HTML stays HTML', async ({page}) => {
        const result = await render(page, [{action: 'insertNode', parentId: 'component-test-viewport', index: 0,
            vnode: vnode('div', 'div-1', {childNodes: [vnode('span', 'span-1')]})
        }], ['div-1', 'span-1']);

        expect(result['div-1']).toEqual({ns: HTML, type: 'HTMLDivElement'});
        expect(result['span-1']).toEqual({ns: HTML, type: 'HTMLSpanElement'})
    });
});
