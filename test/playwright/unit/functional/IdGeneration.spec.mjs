import {setup} from '../../setup.mjs';

const appName = 'IdGenerationTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import FunctionalBase from '../../../../src/functional/component/Base.mjs';

class MockComponent extends FunctionalBase {
    static config = {
        className: 'Test.Unit.Functional.IdGeneration.MockComponent',
        id       : 'cmp-1'
    }
}

MockComponent = Neo.setupClass(MockComponent);

test.describe('Functional Component ID Generation', () => {
    let component;

    test.beforeEach(() => {
        component = Neo.create(MockComponent, {appName});
    });

    test.afterEach(() => {
        component.destroy();
    });

    test('Flat Generation: Should assign sequential IDs within the component scope', () => {
        const vdom = {
            tag: 'div',
            cn : [
                {tag: 'span', text: 'A'},
                {tag: 'span', text: 'B'},
                {tag: 'span', text: 'C'}
            ]
        };

        component.generateIds(vdom);

        expect(vdom.id).toBe('cmp-1__0');
        expect(vdom.cn[0].id).toBe('cmp-1__1');
        expect(vdom.cn[1].id).toBe('cmp-1__2');
        expect(vdom.cn[2].id).toBe('cmp-1__3');
    });

    test('Deep Generation: Should use flat indexing within the same scope', () => {
        const vdom = {
            tag: 'div', // cmp-1__0
            cn : [
                {
                    tag: 'ul', // cmp-1__1
                    cn : [
                        {tag: 'li', text: 'A'}, // cmp-1__2
                        {tag: 'li', text: 'B'}  // cmp-1__3
                    ]
                }
            ]
        };

        component.generateIds(vdom);

        expect(vdom.id).toBe('cmp-1__0');
        expect(vdom.cn[0].id).toBe('cmp-1__1');
        expect(vdom.cn[0].cn[0].id).toBe('cmp-1__2');
        expect(vdom.cn[0].cn[1].id).toBe('cmp-1__3');
    });

    test('Scope Reset: Custom ID should start a new scope', () => {
        const vdom = {
            tag: 'div', // cmp-1__0
            cn : [
                {
                    tag: 'div',
                    id : 'my-scope', // Custom ID -> New Scope
                    cn : [
                        {tag: 'span', text: 'Child 1'}, // my-scope__0
                        {tag: 'span', text: 'Child 2'}  // my-scope__1
                    ]
                },
                {tag: 'div', text: 'Sibling'} // cmp-1__1 (Resumes parent scope)
            ]
        };

        component.generateIds(vdom);

        expect(vdom.id).toBe('cmp-1__0');
        
        // Scope Reset Check
        const scopedDiv = vdom.cn[0];
        expect(scopedDiv.id).toBe('my-scope');
        expect(scopedDiv.cn[0].id).toBe('my-scope__0');
        expect(scopedDiv.cn[1].id).toBe('my-scope__1');

        // Parent Scope Resume Check
        const sibling = vdom.cn[1];
        expect(sibling.id).toBe('cmp-1__1');
    });

    test('Stability under Shift: Scoped children should be shielded', () => {
        // Scenario: Insert a node BEFORE the scoped container.
        // The container's children should keep their IDs ('my-scope__0'), 
        // even though the container itself gets a new ID (if it didn't have one? No, it needs an ID to be a scope).
        
        // Let's assume the container HAS an ID (required for shielding).
        // If we shift the container index, the container ID persists (because it's custom).
        // The children IDs depend on the container ID. So they persist too.
        
        const vdom = {
            tag: 'div', // cmp-1__0
            cn : [
                {tag: 'span', text: 'Inserted Node'}, // cmp-1__1
                {
                    tag: 'div',
                    id : 'my-scope',
                    cn : [
                        {tag: 'span', text: 'Child 1'}, // my-scope__0 (Should match previous test!)
                        {tag: 'span', text: 'Child 2'}  // my-scope__1
                    ]
                }
            ]
        };

        component.generateIds(vdom);

        expect(vdom.id).toBe('cmp-1__0');
        
        // Shifted Node
        expect(vdom.cn[0].id).toBe('cmp-1__1');

        // Shielded Scope
        const scopedDiv = vdom.cn[1];
        expect(scopedDiv.id).toBe('my-scope');
        // Crucial: These IDs MUST MATCH the IDs from the previous test case (0 and 1)
        expect(scopedDiv.cn[0].id).toBe('my-scope__0');
        expect(scopedDiv.cn[1].id).toBe('my-scope__1');
    });
});
