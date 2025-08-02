import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import Button                from '../../../../src/button/Base.mjs';
import HtmlTemplateProcessor from '../../../../src/functional/util/HtmlTemplateProcessor.mjs';
import {html}                from '../../../../src/functional/util/html.mjs';

const processor = HtmlTemplateProcessor;

StartTest(async t => {
    let parsedVdomResult;
    const mockComponent = {
        continueUpdateWithVdom: vdom => {
            parsedVdomResult = vdom;
        }
    };

    t.it('should parse a simple template with a single root node', async t => {
        const template = html`<div><p>Hello</p></div>`;
        await processor.process(template, mockComponent);

        t.expect(parsedVdomResult).toEqual({
            tag: 'div',
            cn: [{
                tag: 'p',
                text: 'Hello'
            }]
        });
    });

    t.it('should handle interpolated values in text nodes', async t => {
        const name = 'Neo';
        const template = html`<p>Hello ${name}</p>`;
        await processor.process(template, mockComponent);

        t.expect(parsedVdomResult).toEqual({
            tag: 'p',
            text: 'Hello Neo'
        });
    });

    t.it('should handle interpolated values in attributes', async t => {
        const id = 'my-div';
        const template = html`<div id="${id}"></div>`;
        await processor.process(template, mockComponent);

        t.expect(parsedVdomResult).toEqual({
            tag: 'div',
            id: 'my-div'
        });
    });

    t.it('should handle non-string (object) values in attributes', async t => {
        const styleObj = {color: 'blue', fontWeight: 'bold'};
        const template = html`<div style="${styleObj}"></div>`;
        await processor.process(template, mockComponent);

        t.expect(parsedVdomResult).toEqual({
            tag: 'div',
            style: styleObj
        });
    });

    t.it('should handle component tags via interpolation (lexical scope)', async t => {
        const template = html`<${Button} text="Click Me"/>`;
        await processor.process(template, mockComponent);

        t.expect(parsedVdomResult).toEqual({
            module: Button,
            text: 'Click Me'
        });
    });

    t.it('should handle component tags via global namespace string', async t => {
        const template = html`<Neo.button.Base text="Global Click"/>`;
        await processor.process(template, mockComponent);

        t.expect(parsedVdomResult).toEqual({
            module: Button,
            text: 'Global Click'
        });
    });
});
