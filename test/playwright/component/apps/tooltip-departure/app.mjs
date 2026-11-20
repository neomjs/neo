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
                {module: Button, id: 'tooltip-departure-plain',    text: 'Plain',  tooltip: {hideDelay: 0, stayOnHover: false, text: 'Plain item'}},
                {module: Button, id: 'tooltip-departure-offset',   text: 'Offset', tooltip: {align: {offset: [0, 12]}, ownInstance: true, text: 'Offset item'}}
            ]
        }, {
            module: Container,
            layout: {ntype: 'hbox'},
            items : [
                {module: Button, id: 'tooltip-departure-own-1', text: 'Own one', tooltip: {ownInstance: true, text: 'Own tooltip one'}},
                {module: Button, id: 'tooltip-departure-own-2', text: 'Own two', tooltip: {ownInstance: true, text: 'Own tooltip two'}},
                {
                    ntype: 'component',
                    id   : 'tooltip-departure-data-host',
                    vdom : {
                        cn: [{
                            id   : 'tooltip-departure-data-pill',
                            cls  : ['neo-multi-window'],
                            data : {neoTooltip: 'Multi-window live example'},
                            style: {alignItems: 'center', display: 'inline-flex', gap: '6px', padding: '6px 12px'},
                            cn   : [
                                {tag: 'i',    id: 'tooltip-departure-data-icon',  text: '❐'},
                                {tag: 'span', id: 'tooltip-departure-data-label', text: 'Multi-window'}
                            ]
                        }]
                    }
                }
            ]
        }]
    },
    name: 'Test.Playwright.TooltipDeparture'
});
