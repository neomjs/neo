import Component from '../../../../src/component/Base.mjs';
import NeoArray  from '../../../../src/util/Array.mjs';

/**
 * Maps a model-family key to its rail token (see `apps/agentos/resources/tokens.css`).
 * Family is an attribute of the resident's CURRENT EmbodiedEpisode era — NOT a per-agent
 * constant and NOT identity. A KNOWN family maps to its --fm-family-* token; anything else
 * degrades to the NEUTRAL --fm-state-off token (never silently to `human`), so an unrecognized
 * or absent family reads as genuinely unclassified rather than being mis-attributed.
 * @type {Object}
 */
const FAMILY_TOKEN = {
    claude: '--fm-family-claude',
    gpt   : '--fm-family-gpt',
    gemini: '--fm-family-gemini',
    human : '--fm-family-human'
};

/**
 * Pure family → rail-token resolver. Unknown / absent family → the neutral token. Uses the
 * `isKnownFamily` hasOwn check (not `MAP[k] ||`) so a prototype-shaped key (`toString`,
 * `constructor`, `__proto__`) can't leak an inherited value past the closed set.
 * @param {String} family
 * @returns {String} a `--fm-family-*` name for a known family, else `--fm-state-off`
 */
export function familyToken(family) {
    return isKnownFamily(family) ? FAMILY_TOKEN[family] : '--fm-state-off'
}

/**
 * Whether `family` is a recognized family key — drives the `unclassified` render marker.
 * @param {String} family
 * @returns {Boolean}
 */
export function isKnownFamily(family) {
    return Object.hasOwn(FAMILY_TOKEN, family)
}

/**
 * The family-accent rail on the leading edge of a resident's card. Its color binds DATA-DRIVEN
 * from the resident's CURRENT-era family key — so a family swap (e.g. Opus→Fable) re-renders the
 * rail in place for the SAME resident, never forks a new self (the anti-lock-in binding enforced
 * here once instead of re-derived per consumer). An unknown or absent family renders NEUTRAL with
 * an `unclassified` marker rather than guessing a family.
 *
 * The family key is a `harnessType`-derived proxy, declared as such until the identity-state
 * schema lands the first-class era attribute — the binding surface is stable; only the source of
 * the key changes.
 *
 * @class AgentOS.view.fleet.FamilyRail
 * @extends Neo.component.Base
 */
class FamilyRail extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.FamilyRail'
         * @protected
         */
        className: 'AgentOS.view.fleet.FamilyRail',
        /**
         * @member {String} ntype='fm-family-rail'
         * @protected
         */
        ntype: 'fm-family-rail',
        /**
         * @member {String[]} baseCls=['fm-family-rail']
         */
        baseCls: ['fm-family-rail'],
        /**
         * The current-era family — `claude` · `gpt` · `gemini` · `human`. A data-driven episode
         * attribute, never a per-agent constant. Unknown / absent renders neutral + `unclassified`.
         * @member {String|null} family_=null
         * @reactive
         */
        family_: null
    }

    /**
     * Triggered after the family config changed — data-driven rebind. A family swap re-renders the
     * rail in place for the SAME resident (anti-lock-in). Known → its --fm-family-* token; unknown
     * or absent → the neutral token + the `unclassified` marker (never a guessed family).
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetFamily(value, oldValue) {
        let me    = this,
            cls   = me.cls,
            style = me.style || {};

        NeoArray[isKnownFamily(value) ? 'remove' : 'add'](cls, 'fm-family-unclassified');
        me.cls = cls;

        style['--fm-rail'] = `var(${familyToken(value)})`;
        me.style = style
    }
}

export default Neo.setupClass(FamilyRail);
