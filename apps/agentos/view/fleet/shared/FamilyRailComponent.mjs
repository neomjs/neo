import Component from '../../../../../src/component/Base.mjs';
import NeoArray  from '../../../../../src/util/Array.mjs';

import {familyClass, isKnownFamily} from '../../../util/familyTokens.mjs';

export {familyClass, familyToken, isKnownFamily} from '../../../util/familyTokens.mjs';

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
 * @class AgentOS.view.fleet.shared.FamilyRailComponent
 * @extends Neo.component.Base
 */
class FamilyRail extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.shared.FamilyRailComponent'
         * @protected
         */
        className: 'AgentOS.view.fleet.shared.FamilyRailComponent',
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
     * rail in place for the SAME resident (anti-lock-in). Known → its `fm-family-*` class (which
     * binds the `--fm-rail` token in the component SCSS — zero inline styles); unknown or absent →
     * the `unclassified` marker class, which carries the neutral rail binding (never a guessed
     * family).
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetFamily(value, oldValue) {
        let me       = this,
            cls      = me.cls,
            oldClass = familyClass(oldValue),
            newClass = familyClass(value);

        oldClass && NeoArray.remove(cls, oldClass);
        newClass && NeoArray.add(cls, newClass);

        NeoArray[isKnownFamily(value) ? 'remove' : 'add'](cls, 'fm-family-unclassified');

        me.cls = cls
    }
}

export default Neo.setupClass(FamilyRail);
