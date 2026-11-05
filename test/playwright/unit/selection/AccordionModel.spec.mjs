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

    test('click selection, vdom/cls synchronization across expand/collapse, and disableSelection', async () => {
        const accordion       = await createAccordion({initialOpen: [0], maxExpandedItems: 1}),
              items           = accordion.getAccordionItems(),
              model           = accordion.selectionModel,
              selectionEvents = [];

        expect(model).toBeInstanceOf(AccordionModel);
        expect(items).toHaveLength(3);
        expect(items[0].vdom.tabIndex).toBe(-1);

        accordion.on('select', data => selectionEvents.push(data));

        model.onItemClick({
            path: [{id: items[1].id, cls: items[1].cls}]
        });

        expect(model.isSelected(items[1].id)).toBe(true);
        expect(items[1].cls).toContain('neo-selected');
        expect(items[1].vdom.cls).toContain('neo-selected');
        expect(items[1].vdom['aria-selected']).toBe(true);
        expect(selectionEvents).toHaveLength(1);
        expect(selectionEvents[0].records[0]).toBe(items[1]);

        // Toggling expanded on a selected AccordionItem must preserve 'neo-selected'
        accordion.childExpandChange({expanded: true, target: items[1]});
        expect(items[1].expanded).toBe(true);
        expect(items[1].cls).toContain('neo-expanded');
        expect(items[1].cls).toContain('neo-selected');
        expect(items[1].vdom.cls).toContain('neo-selected');

        // Selecting another item deselects the previous item cleanly
        model.selectAt(2);
        expect(model.isSelected(items[1].id)).toBe(false);
        expect(items[1].cls).not.toContain('neo-selected');
        expect(items[1].vdom['aria-selected']).toBeUndefined();
        expect(model.isSelected(items[2].id)).toBe(true);
        expect(items[2].cls).toContain('neo-selected');

        // Setting disableSelection=true clears the active selection and blocks subsequent clicks
        accordion.disableSelection = true;
        expect(model.hasSelection()).toBe(false);
        expect(items[2].cls).not.toContain('neo-selected');

        model.onItemClick({
            path: [{id: items[0].id, cls: items[0].cls}]
        });
        expect(model.hasSelection()).toBe(false);

        accordion.destroy()
    });

    test('keyboard navigation (Down, Up, Right, Left, Enter, Escape) and boundary events with title header', async () => {
        const accordion = await createAccordion({
                  title           : 'Titled Accordion',
                  maxExpandedItems: 1,
                  initialOpen     : []
              }),
              items     = accordion.getAccordionItems(),
              model     = accordion.selectionModel,
              events    = [];

        expect(items).toHaveLength(3);

        accordion.on('selectPreFirstItem', () => events.push('selectPreFirstItem'));
        accordion.on('selectPostLastItem', () => events.push('selectPostLastItem'));

        // Down with no selection selects root (index 0)
        model.onKeyDownDown({});
        expect(model.getSelection()).toEqual([items[0].id]);

        // Up at index 0 deselects all and fires selectPreFirstItem
        model.onKeyDownUp({});
        expect(model.hasSelection()).toBe(false);
        expect(events).toEqual(['selectPreFirstItem']);

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

        // Escape clears active selection
        model.selectAt(1);
        expect(model.hasSelection()).toBe(true);
        model.onKeyDownEscape({});
        expect(model.hasSelection()).toBe(false);

        accordion.destroy()
    })
});
