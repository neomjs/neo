import Button    from '../../../../../src/button/Base.mjs';
import Container from '../../../../../src/container/Base.mjs';
import Viewport  from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Component-test fixture for tooltip departures: a row of neighbouring buttons on the shared tooltip, ending
 * in one whose own tooltip aligns with a 12px offset, and a row whose buttons own their tooltips, with empty space
 * around both.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'tooltip-departure-viewport',
        layout: {ntype: 'vbox', align: 'start'},
        style : {gap: '160px', padding: '120px'},
        items : [{
            module: Container,
            layout: {ntype: 'hbox'},
            items : [
                {module: Button, id: 'tooltip-departure-shared-1', text: 'Edit',   tooltip: 'Edit item'},
                {module: Button, id: 'tooltip-departure-shared-2', text: 'Copy',   tooltip: 'Copy item'},
                {module: Button, id: 'tooltip-departure-shared-3', text: 'Delete', tooltip: 'Delete item'},
                {module: Button, id: 'tooltip-departure-offset',   text: 'Offset', tooltip: {align: {offset: [0, 12]}, ownInstance: true, text: 'Offset item'}}
            ]
        }, {
            module: Container,
            layout: {ntype: 'hbox'},
            items : [
                {module: Button, id: 'tooltip-departure-own-1', text: 'Own one', tooltip: {ownInstance: true, text: 'Own tooltip one'}},
                {module: Button, id: 'tooltip-departure-own-2', text: 'Own two', tooltip: {ownInstance: true, text: 'Own tooltip two'}}
            ]
        }]
    },
    name: 'Test.Playwright.TooltipDeparture'
});
