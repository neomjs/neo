import {setup} from '../../setup.mjs';

const appName = 'AccordionModelUnitTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import VDomHelper     from '../../../../src/vdom/Helper.mjs';
import Label          from '../../../../src/component/Label.mjs';
import Accordion      from '../../../../src/container/Accordion.mjs';
import AccordionModel from '../../../../src/selection/AccordionModel.mjs';

test.describe('Neo.selection.AccordionModel (#4628)', () => {
    const createAccordion = async (config = {}) => {
        const accordion = Neo.create({
            module        : Accordion,
            appName,
            selectionModel: {ntype: 'selection-accordionmodel'},
            items         : [{
                title: 'Section 1',
                items: [{ntype: 'component', html: 'Content 1'}]
            }, {
                title: 'Section 2',
                items: [{ntype: 'component', html: 'Content 2'}]
            }, {
                title: 'Section 3',
                items: [{ntype: 'component', html: 'Content 3'}]
            }],
            ...config
        });

        await accordion.initVnode();
        accordion.mounted = true;

        return accordion
    };

    test('click selection, roving header tabIndex, vdom/cls synchronization across expand/collapse, and disableSelection', async () => {
        const accordion       = await createAccordion({initialOpen: [0], maxExpandedItems: 1}),
              items           = accordion.getAccordionItems(),
              headers         = items.map(item => item.getHeader()),
              model           = accordion.selectionModel,
              selectionEvents = [];

        expect(model).toBeInstanceOf(AccordionModel);
        expect(items).toHaveLength(3);
        expect(items[0].vdom.tabIndex).toBe(-1);

        // Initial roving tabIndex: first header is tabbable (0), remaining headers are -1
        expect(headers[0].vdom.tabIndex).toBe(0);
        expect(headers[1].vdom.tabIndex).toBe(-1);
        expect(headers[2].vdom.tabIndex).toBe(-1);

        accordion.on('select', data => selectionEvents.push(data));

        // Tabbing/focusing into header 0 selects item 0
        model.onHeaderFocus({
            path: [
                {id: headers[0].id, cls: headers[0].cls},
                {id: items[0].id,   cls: items[0].cls}
            ]
        });
        expect(model.isSelected(items[0].id)).toBe(true);
        expect(headers[0].vdom.tabIndex).toBe(0);

        model.onItemClick({
            path: [{id: items[1].id, cls: items[1].cls}]
        });

        expect(model.isSelected(items[1].id)).toBe(true);
        expect(items[1].cls).toContain('neo-selected');
        expect(items[1].vdom.cls).toContain('neo-selected');
        expect(items[1].vdom['aria-selected']).toBe(true);
        expect(headers[0].vdom.tabIndex).toBe(-1);
        expect(headers[1].vdom.tabIndex).toBe(0);
        expect(headers[2].vdom.tabIndex).toBe(-1);
        expect(selectionEvents).toHaveLength(2);
        expect(selectionEvents[1].records[0]).toBe(items[1]);

        // Toggling expanded on a selected AccordionItem must preserve 'neo-selected'
        accordion.childExpandChange({expanded: true, target: items[1]});
        expect(items[1].expanded).toBe(true);
        expect(items[1].cls).toContain('neo-expanded');
        expect(items[1].cls).toContain('neo-selected');
        expect(items[1].vdom.cls).toContain('neo-selected');

        // Selecting another item deselects the previous item cleanly and moves roving tabIndex
        model.selectAt(2);
        expect(model.isSelected(items[1].id)).toBe(false);
        expect(items[1].cls).not.toContain('neo-selected');
        expect(items[1].vdom['aria-selected']).toBeUndefined();
        expect(model.isSelected(items[2].id)).toBe(true);
        expect(items[2].cls).toContain('neo-selected');
        expect(headers[1].vdom.tabIndex).toBe(-1);
        expect(headers[2].vdom.tabIndex).toBe(0);

        // Setting disableSelection=true clears the active selection, resets header tabIndex to -1, and blocks clicks
        accordion.disableSelection = true;
        expect(model.hasSelection()).toBe(false);
        expect(items[2].cls).not.toContain('neo-selected');
        expect(headers[0].vdom.tabIndex).toBe(-1);
        expect(headers[1].vdom.tabIndex).toBe(-1);
        expect(headers[2].vdom.tabIndex).toBe(-1);

        model.onItemClick({
            path: [{id: items[0].id, cls: items[0].cls}]
        });
        expect(model.hasSelection()).toBe(false);

        // Re-enabling selection restores a roving tabIndex stop
        accordion.disableSelection = false;
        expect(headers[2].vdom.tabIndex).toBe(0);

        accordion.destroy()
    });

    test('keyboard navigation (Down, Up, Right, Left, Enter, Escape) and boundary events with title header', async () => {
        const accordion = await createAccordion({
                  title           : 'Titled Accordion',
                  maxExpandedItems: 1,
                  initialOpen     : []
              }),
              items     = accordion.getAccordionItems(),
              headers   = items.map(item => item.getHeader()),
              model     = accordion.selectionModel,
              events    = [];

        expect(items).toHaveLength(3);

        accordion.on('selectPreFirstItem', () => events.push('selectPreFirstItem'));
        accordion.on('selectPostLastItem', () => events.push('selectPostLastItem'));

        // Down with no selection selects root (index 0)
        model.onKeyDownDown({});
        expect(model.getSelection()).toEqual([items[0].id]);
        expect(headers[0].vdom.tabIndex).toBe(0);

        // Up at index 0 deselects all and fires selectPreFirstItem while retaining roving tabIndex stop
        model.onKeyDownUp({});
        expect(model.hasSelection()).toBe(false);
        expect(events).toEqual(['selectPreFirstItem']);
        expect(headers[0].vdom.tabIndex).toBe(0);

        // Right with no selection selects root (index 0)
        model.onKeyDownRight({});
        expect(model.getSelection()).toEqual([items[0].id]);
        expect(items[0].expanded).toBe(false);

        // Right on collapsed item expands it via childExpandChange
        model.onKeyDownRight({});
        expect(items[0].expanded).toBe(true);
        expect(accordion.expandedItems).toEqual([items[0].id]);

        // Right on already-expanded item navigates to next item (index 1)
        model.onKeyDownRight({});
        expect(model.getSelection()).toEqual([items[1].id]);
        expect(headers[0].vdom.tabIndex).toBe(-1);
        expect(headers[1].vdom.tabIndex).toBe(0);

        // Enter toggles expanded state on selected item (respecting maxExpandedItems: 1)
        model.onKeyDownEnter({});
        expect(items[1].expanded).toBe(true);
        expect(items[0].expanded).toBe(false);
        expect(accordion.expandedItems).toEqual([items[1].id]);

        // Left on expanded item collapses it
        model.onKeyDownLeft({});
        expect(items[1].expanded).toBe(false);
        expect(accordion.expandedItems).toEqual([]);

        // Left on collapsed item navigates to previous item (index 0)
        model.onKeyDownLeft({});
        expect(model.getSelection()).toEqual([items[0].id]);

        // Navigate to last item (index 2) and press Down past end
        model.selectAt(2);
        model.onKeyDownDown({});
        expect(model.hasSelection()).toBe(false);
        expect(events).toEqual(['selectPreFirstItem', 'selectPostLastItem']);

        // Escape clears active selection while retaining roving tabIndex stop
        model.selectAt(1);
        expect(model.hasSelection()).toBe(true);
        model.onKeyDownEscape({});
        expect(model.hasSelection()).toBe(false);
        expect(headers[1].vdom.tabIndex).toBe(0);

        accordion.destroy()
    });

    test('descendant interactive controls inside .neo-accordion-content do not trigger accordion navigation or expansion', async () => {
        const accordion  = await createAccordion({initialOpen: [0], maxExpandedItems: 1}),
              items      = accordion.getAccordionItems(),
              header0    = items[0].getHeader(),
              content0   = items[0].down({flag: 'content'}),
              model      = accordion.selectionModel,
              inputEvent = {
                  target: {id: 'nested-input', tagName: 'input'},
                  path  : [
                      {id: 'nested-input', tagName: 'input', cls: ['neo-textfield-input']},
                      {id: content0.id,    tagName: 'div',   cls: content0.cls},
                      {id: items[0].id,    tagName: 'div',   cls: items[0].cls},
                      {id: accordion.id,   tagName: 'div',   cls: accordion.cls}
                  ]
              },
              buttonEvent = {
                  target: {id: 'nested-button', tagName: 'button'},
                  path  : [
                      {id: 'nested-button', tagName: 'button', cls: ['neo-button']},
                      {id: content0.id,     tagName: 'div',    cls: content0.cls},
                      {id: items[0].id,     tagName: 'div',    cls: items[0].cls},
                      {id: accordion.id,    tagName: 'div',    cls: accordion.cls}
                  ]
              },
              headerEvent = {
                  target: {id: header0.id, tagName: 'div'},
                  path  : [
                      {id: header0.id,   tagName: 'div', cls: header0.cls},
                      {id: items[0].id,  tagName: 'div', cls: items[0].cls},
                      {id: accordion.id, tagName: 'div', cls: accordion.cls}
                  ]
              };

        model.select(items[0].id);
        expect(items[0].expanded).toBe(true);
        expect(model.getSelection()).toEqual([items[0].id]);

        // Space/Enter/Arrow/Escape inside nested input or button must NOT collapse item 0 or move selection
        model.onKeyDownEnter(inputEvent);
        expect(items[0].expanded).toBe(true);
        model.onKeyDownDown(inputEvent);
        model.onKeyDownUp(inputEvent);
        model.onKeyDownLeft(inputEvent);
        model.onKeyDownRight(inputEvent);
        model.onKeyDownEscape(inputEvent);
        expect(items[0].expanded).toBe(true);
        expect(model.getSelection()).toEqual([items[0].id]);

        model.onKeyDownEnter(buttonEvent);
        model.onKeyDownDown(buttonEvent);
        expect(items[0].expanded).toBe(true);
        expect(model.getSelection()).toEqual([items[0].id]);

        // Positive control: key event on header toggles expansion and navigates
        model.onKeyDownEnter(headerEvent);
        expect(items[0].expanded).toBe(false);
        model.onKeyDownEnter(headerEvent);
        expect(items[0].expanded).toBe(true);
        model.onKeyDownDown(headerEvent);
        expect(model.getSelection()).toEqual([items[1].id]);

        accordion.destroy()
    });

    test('selectionModel replacement lifecycle across construct, pre-initVnode, mounted, and null-clear states', async () => {
        const initialModel = Neo.create({module: AccordionModel}),
              preInitModel = Neo.create({module: AccordionModel}),
              mountedModel = Neo.create({module: AccordionModel});

        // 1. Construct with initialModel, then replace with preInitModel BEFORE initVnode()
        const accordion = Neo.create({
            module        : Accordion,
            appName,
            selectionModel: initialModel,
            items         : [
                {title: 'Item A', items: [{ntype: 'component', html: 'A'}]},
                {title: 'Item B', items: [{ntype: 'component', html: 'B'}]}
            ]
        });

        expect(initialModel.view).toBe(accordion);
        expect(accordion.vnodeInitialized).toBe(false);

        accordion.selectionModel = preInitModel;

        expect(initialModel.isDestroyed).toBe(true);
        expect(initialModel.view).toBeNull();
        expect(preInitModel.view).toBe(accordion);

        await accordion.initVnode();
        accordion.mounted = true;

        const items   = accordion.getAccordionItems(),
              headers = items.map(item => item.getHeader());

        expect(headers[0].vdom.tabIndex).toBe(0);
        expect(headers[1].vdom.tabIndex).toBe(-1);

        preInitModel.selectAt(1);
        expect(preInitModel.isSelected(items[1].id)).toBe(true);
        expect(headers[1].vdom.tabIndex).toBe(0);

        // 2. Replace with mountedModel AFTER initVnode() / mount
        accordion.selectionModel = mountedModel;

        expect(preInitModel.isDestroyed).toBe(true);
        expect(preInitModel.view).toBeNull();
        expect(items[1].cls).not.toContain('neo-selected');
        expect(mountedModel.view).toBe(accordion);
        expect(headers[0].vdom.tabIndex).toBe(0);
        expect(headers[1].vdom.tabIndex).toBe(-1);

        mountedModel.selectAt(0);
        expect(mountedModel.isSelected(items[0].id)).toBe(true);

        // 3. Clear selectionModel = null and verify clean teardown
        accordion.selectionModel = null;

        expect(mountedModel.isDestroyed).toBe(true);
        expect(mountedModel.view).toBeNull();
        expect(items[0].cls).not.toContain('neo-selected');
        expect(headers[0].vdom.tabIndex).toBe(-1);
        expect(headers[1].vdom.tabIndex).toBe(-1);

        expect(() => accordion.destroy()).not.toThrow()
    })
});
