import {setup} from '../../setup.mjs';

setup({neoConfig: {allowVdomUpdatesInTests: true}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import EffectButton    from '../../../../src/button/Effect.mjs';
import TabEffectButton from '../../../../src/tab/header/EffectButton.mjs';

test.describe('Neo.button.Effect aria-pressed (Node.js)', () => {

    test('a plain Effect button renders no aria-pressed and no pressed class', () => {
        const button = Neo.create(EffectButton, {text: 'Plain'});

        try {
            expect(button.pressed).toBeNull();
            expect(button.vdom['aria-pressed']).toBeUndefined();
            expect(button.vdom.cls).not.toContain('pressed')
        } finally {
            button.destroy()
        }
    });

    test('a toggle renders aria-pressed, and the class and attribute change together', () => {
        const button = Neo.create(EffectButton, {text: 'Toggle', pressed: false});

        try {
            expect(button.vdom['aria-pressed']).toBe('false');
            expect(button.vdom.cls).not.toContain('pressed');

            button.pressed = true;
            expect(button.vdom['aria-pressed']).toBe('true');
            expect(button.vdom.cls).toContain('pressed');

            button.pressed = false;
            expect(button.vdom['aria-pressed']).toBe('false');
            expect(button.vdom.cls).not.toContain('pressed');

            button.pressed = null;
            expect(button.vdom['aria-pressed']).toBeUndefined();
            expect(button.vdom.cls).not.toContain('pressed')
        } finally {
            button.destroy()
        }
    });

    test('a tab header EffectButton renders aria-selected and never aria-pressed', () => {
        const tab = Neo.create(TabEffectButton, {text: 'Tab', pressed: false});

        try {
            expect(tab.vdom['aria-selected']).toBe(false);
            expect(tab.vdom['aria-pressed']).toBeUndefined();

            tab.pressed = true;
            expect(tab.vdom['aria-selected']).toBe(true);
            expect(tab.vdom['aria-pressed']).toBeUndefined();
            expect(tab.vdom.cls).toContain('pressed')
        } finally {
            tab.destroy()
        }
    });

    test('a pressed toggle drops aria-pressed while it renders a link, and regains it as a button', () => {
        const button = Neo.create(EffectButton, {text: 'Details', pressed: true});

        try {
            expect(button.vdom.tag).toBe('button');
            expect(button.vdom['aria-pressed']).toBe('true');

            button.url = 'https://neomjs.com';
            expect(button.vdom.tag).toBe('a');
            expect(button.vdom['aria-pressed']).toBeUndefined();
            expect(button.vdom.cls).toContain('pressed');

            button.url = null;
            expect(button.vdom.tag).toBe('button');
            expect(button.vdom['aria-pressed']).toBe('true');

            button.pressed = false;
            expect(button.vdom['aria-pressed']).toBe('false')
        } finally {
            button.destroy()
        }
    });

    test('a pressed toggle with a route renders a link without aria-pressed', () => {
        const button = Neo.create(EffectButton, {text: 'Details', route: '#details', editRoute: false, pressed: true});

        try {
            expect(button.vdom.tag).toBe('a');
            expect(button.vdom.href).toBe('#details');
            expect(button.vdom['aria-pressed']).toBeUndefined()
        } finally {
            button.destroy()
        }
    });
});
