import RoundTableCanvas from '../../../../../../src/app/roundtable/Canvas.mjs';

/**
 * @summary The hero's round table: a week of the repository's public record, replayed behind the statement.
 *
 * The scene, its record and what the statement keeps free are the engine's ({@link Neo.app.roundtable.Canvas},
 * {@link Neo.canvas.RoundTable}). This class names the Portal's part: the file the record comes from
 * (`buildScripts/docs/recordWeek.mjs` writes it) and the colours per theme. A model family's colour is its
 * identity on this page only; the warning colour is the one warm thing, so a change request is the event the eye
 * finds.
 *
 * @class Portal.view.home.parts.hero.Canvas
 * @extends Neo.app.roundtable.Canvas
 */
class CanvasComponent extends RoundTableCanvas {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.hero.Canvas'
         * @protected
         */
        className: 'Portal.view.home.parts.hero.Canvas',
        /**
         * @member {String[]} cls=['portal-home-hero-canvas']
         */
        cls: ['portal-home-hero-canvas'],
        /**
         * @member {Object} look
         */
        look: {
            measures: {standaloneFallbackSquare: [2, 1]},
            palettes: {
                dark: {
                    card  : 'rgba(13, 18, 36, 0.94)',
                    door  : '#F2F4FA',
                    ground: ['rgba(62, 99, 221, 0.15)', 'rgba(139, 166, 255, 0.15)'],
                    groups: {claude: '#B49BFF', gemini: '#5EA2FF', gpt: '#3DD6C4'},
                    ink   : '#E8ECF8',
                    inkDim: '#8E9BBF',
                    line  : 'rgba(160, 178, 255, 0.28)',
                    merge : '#FFFFFF',
                    warn  : '#FFB454'
                },
                light: {
                    card  : 'rgba(255, 255, 255, 0.96)',
                    chord : 0.9, // a thin line on white needs more of its colour than one on navy
                    door  : '#39425C',
                    ground: ['rgba(62, 99, 221, 0.05)', 'rgba(139, 166, 255, 0.05)'],
                    groups: {claude: '#6D4AE6', gemini: '#1F6FEB', gpt: '#0E8F82'},
                    ink   : '#1B2440',
                    inkDim: '#5A6788',
                    line  : 'rgba(62, 99, 221, 0.28)',
                    merge : '#0F172A',
                    warn  : '#B45309'
                }
            }
        },
        /**
         * @member {String} recordUrl='../../apps/portal/resources/data/record-week.json'
         */
        recordUrl: '../../apps/portal/resources/data/record-week.json'
    }
}

export default Neo.setupClass(CanvasComponent);
