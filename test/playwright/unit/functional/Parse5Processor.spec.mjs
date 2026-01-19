import {setup} from '../../setup.mjs';

setup();

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import Button                from '../../../../src/button/Base.mjs';
import HtmlTemplateProcessor from '../../../../src/functional/util/HtmlTemplateProcessor.mjs';
import {html}                from '../../../../src/functional/util/html.mjs';

const processor = HtmlTemplateProcessor;
let parsedVdomResult;
let mockComponent;

test.describe('functional/Parse5Processor', () => {
    /**
     * @summary Verifies the HtmlTemplateProcessor's ability to correctly parse tagged templates into VDOM structures.
     * This suite tests various scenarios, including simple HTML, interpolated values for text and attributes,
     * and the correct resolution of both lexically-scoped and globally-namespaced Neo components.
     */

    test.beforeEach(()=>{
        mockComponent = {
            continueUpdateWithVdom: vdom => {
                parsedVdomResult = vdom;
            }
        };
    });

    test('should parse a simple template with a single root node', async () => {
        const template = html`<div><p>Hello</p></div>`;
        await processor.process(template, mockComponent);

        expect(parsedVdomResult).toEqual({
            tag: 'div',
            cn: [{
                tag: 'p',
                text: 'Hello'
            }]
        });
    });

    test('should handle interpolated values in text nodes', async () => {
        const name = 'Neo';
        const template = html`<p>Hello ${name}</p>`;
        await processor.process(template, mockComponent);

        expect(parsedVdomResult).toEqual({
            tag: 'p',
            text: 'Hello Neo'
        });
    });

    test('should handle interpolated values in attributes', async () => {
        const id = 'my-div';
        const template = html`<div id="${id}"></div>`;
        await processor.process(template, mockComponent);

        expect(parsedVdomResult).toEqual({
            tag: 'div',
            id: 'my-div'
        });
    });

    test('should handle non-string (object) values in attributes', async () => {
        const styleObj = { color: 'blue', fontWeight: 'bold' };
        const template = html`<div style="${styleObj}"></div>`;
        await processor.process(template, mockComponent);

        expect(parsedVdomResult).toEqual({
            tag: 'div',
            style: styleObj
        });
    });

    test('should handle component tags via interpolation (lexical scope)', async () => {
        const template = html`<${Button} text="Click Me"/>`;
        await processor.process(template, mockComponent);

        expect(parsedVdomResult).toEqual({
            module: Button,
            text: 'Click Me'
        });
    });

    test('should handle component tags via global namespace string', async () => {
        const template = html`<Neo.button.Base text="Global Click"/>`;
        await processor.process(template, mockComponent);

        expect(parsedVdomResult).toEqual({
            module: Button,
            text: 'Global Click'
        });
    });
});
