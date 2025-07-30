import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import HtmlStringToVdom from '../../../../src/main/addon/HtmlStringToVdom.mjs';

const addon = Neo.create(HtmlStringToVdom);

StartTest(t => {
    t.it('should parse a simple HTML string with a single root node', async t => {
        const html = '<div><p>Hello</p></div>';
        const vdom = await addon.createVdom({value: html});

        t.expect(vdom).toEqual({
            tag: 'div',
            cn: [
                {
                    tag: 'p',
                    cn: ['Hello']
                }
            ]
        });
    });

    t.it('should parse attributes correctly', async t => {
        const html = '<div id="my-div" class="foo bar" style="color: red; font-size: 16px;"></div>';
        const vdom = await addon.createVdom({value: html});

        t.expect(vdom).toEqual({
            tag: 'div',
            id: 'my-div',
            cls: 'foo bar',
            style: {
                color: 'red',
                fontSize: '16px'
            }
        });
    });

    t.it('should handle multiple root elements by returning an array', async t => {
        const html = '<p>One</p><span>Two</span>';
        const vdom = await addon.createVdom({value: html});

        t.expect(vdom).toEqual([
            {
                tag: 'p',
                cn: ['One']
            },
            {
                tag: 'span',
                cn: ['Two']
            }
        ]);
    });

    t.it('should handle dynamic values in text nodes', async t => {
        const html = '<p>__DYNAMIC_VALUE_0__</p>';
        const values = ['Hello World'];
        const vdom = await addon.createVdom({value: html, values: values});

        t.expect(vdom).toEqual({
            tag: 'p',
            cn: ['Hello World']
        });
    });

    t.it('should handle dynamic values in attributes', async t => {
        const html = '<div id="__DYNAMIC_VALUE_0__"></div>';
        const values = ['my-dynamic-id'];
        const vdom = await addon.createVdom({value: html, values: values});

        t.expect(vdom).toEqual({
            tag: 'div',
            id: 'my-dynamic-id'
        });
    });

    t.it('should handle multiple dynamic values', async t => {
        const html = '<div class="__DYNAMIC_VALUE_0__"><p>__DYNAMIC_VALUE_1__</p></div>';
        const values = ['my-class', 'my-text'];
        const vdom = await addon.createVdom({value: html, values: values});

        t.expect(vdom).toEqual({
            tag: 'div',
            cls: 'my-class',
            cn: [
                {
                    tag: 'p',
                    cn: ['my-text']
                }
            ]
        });
    });

    t.it('should handle non-string dynamic values (e.g., component configs)', async t => {
        const html = '<div>__DYNAMIC_VALUE_0__</div>';
        const component = {ntype: 'component', id: 'my-comp'};
        const values = [component];
        const vdom = await addon.createVdom({value: html, values: values});

        t.expect(vdom).toEqual({
            tag: 'div',
            cn: [
                {
                    ntype: 'component',
                    id: 'my-comp'
                }
            ]
        });
    });

    t.it('should handle void elements correctly (e.g., <input>)', async t => {
        const html = '<input type="text" value="test">';
        const vdom = await addon.createVdom({value: html});

        t.expect(vdom).toEqual({
            tag: 'input',
            type: 'text',
            value: 'test'
        });
    });

    t.it('should ignore whitespace-only text nodes', async t => {
        const html = '<div>  <p>Hi</p>  </div>';
        const vdom = await addon.createVdom({value: html});

        t.expect(vdom).toEqual({
            tag: 'div',
            cn: [
                {
                    tag: 'p',
                    cn: ['Hi']
                }
            ]
        });
    });

    t.it('should handle an array of parsing requests', async t => {
        const requests = [
            { value: '<h1>Title</h1>' },
            { value: '<p>__DYNAMIC_VALUE_0__</p>', values: ['Paragraph'] }
        ];
        const vdoms = await addon.createVdom(requests);

        t.expect(vdoms).toEqual([
            {
                tag: 'h1',
                cn: ['Title']
            },
            {
                tag: 'p',
                cn: ['Paragraph']
            }
        ]);
    });
});
