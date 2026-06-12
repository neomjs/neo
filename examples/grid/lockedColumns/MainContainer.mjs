import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * A purpose-built locked-column grid fixture for whitebox-e2e. Provides a stable multi-region grid —
 * a frozen locked-start region, a horizontally-scrollable centre, and a frozen locked-end region —
 * that test specs can drive and assert against, decoupled from any product app. The geometry is owned
 * here for test math, so it has no reason to churn the way a demo app's columns do.
 *
 * GEOMETRY CONTRACT (stable — chosen for test math, never demo aesthetics):
 *   locked-start : id(60) + rank(60) + login(250)                = 370px frozen left region
 *   centre       : totalContributions(100) + commitRatio(90) + privateContributionsRatio(90)
 *                  + an overflow tail of 14 year columns y2024..y2011 (@110px) = 1820px total, which
 *                  OVERFLOWS the ~1410px centre viewport (1920 - 370 lockedStart - 140 lockedEnd).
 *                  The overflow is what gives the centre a dedicated horizontal scrollbar + overdrag
 *                  auto-scroll to exercise. The first THREE centre dataFields stay fixed
 *                  (totalContributions/commitRatio/privateContributionsRatio) so cross-region
 *                  drag-and-drop landing math is unaffected by the tail.
 *   locked-end   : lastUpdated(140)                              = frozen right region
 *
 * @class Neo.examples.grid.lockedColumns.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.grid.lockedColumns.MainContainer',
        layout   : {ntype: 'fit'},

        items: [{
            module : GridContainer,
            store  : MainStore,

            columns: [
                {dataField: 'id',                        locked: 'start', text: '#',         width: 60},
                {dataField: 'rank',                      locked: 'start', text: 'Rank',      width: 60},
                {dataField: 'login',                     locked: 'start', text: 'User',      width: 250},
                {dataField: 'totalContributions',                         text: 'Total',     width: 100},
                {dataField: 'commitRatio',                                text: 'Commits %', width: 90},
                {dataField: 'privateContributionsRatio',                  text: 'Private %', width: 90},
                // overflow tail — enough centre width to exercise the horizontal scrollbar + overdrag
                ...Array.from({length: 14}, (_, i) => {
                    const year = 2024 - i;
                    return {dataField: `y${year}`, text: `${year}`, width: 110}
                }),
                {dataField: 'lastUpdated',               locked: 'end',   text: 'Updated',   width: 140}
            ]
        }]
    }
}

export default Neo.setupClass(MainContainer);
