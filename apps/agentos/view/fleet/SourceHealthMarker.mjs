import Component                  from '../../../../src/component/Base.mjs';
import NeoArray                   from '../../../../src/util/Array.mjs';
import {normalizeFleetSourceFact} from './sourceHealth.mjs';

const SOURCE_LABELS = Object.freeze({
    roster    : {long: 'Roster',     short: 'ROS'},
    repoStatus: {long: 'Repository', short: 'REP'},
    runtime   : {long: 'Runtime',    short: 'RUN'}
});

const
    SOURCE_STATE_CLASSES      = Object.freeze(['fm-source-wired', 'fm-source-missing', 'fm-source-not-wired']),
    SOURCE_CONFIDENCE_CLASSES = Object.freeze(['fm-confidence-observed', 'fm-confidence-inferred', 'fm-confidence-none']);

/**
 * @summary Resolve one source fact into its visible and accessible marker treatment. Both state and
 * confidence remain explicit; normalization ensures no malformed combination can look healthy.
 * @param {String} sourceKey `roster` · `repoStatus` · `runtime`
 * @param {*} health Source-health input; malformed values fail closed.
 * @returns {{state: String, confidence: String, stateClass: String, confidenceClass: String,
 * text: String, ariaLabel: String}}
 */
export function sourceMarkerView(sourceKey, health) {
    const
        label      = Object.hasOwn(SOURCE_LABELS, sourceKey) ? SOURCE_LABELS[sourceKey] : {long: 'Unknown', short: 'SRC'},
        normalized = normalizeFleetSourceFact(sourceKey, health),
        treatment  = normalized.state === 'wired'
            ? normalized.confidence.toUpperCase()
            : normalized.state === 'missing'
                ? 'MISSING'
                : normalized.state === 'invalid'
                    ? 'INVALID'
                    : 'NOT WIRED';

    return {
        ...normalized,
        stateClass     : `fm-source-${normalized.state}`,
        confidenceClass: `fm-confidence-${normalized.confidence}`,
        text           : `${label.short} ${treatment}`,
        ariaLabel      : `${label.long} source: ${normalized.state.replace('-', ' ')}, confidence ${normalized.confidence}.`
    }
}

/**
 * @summary Reusable card-grain source-health marker. Visible text, geometry, and ARIA expose the
 * source state plus confidence without color-only meaning; all color bindings remain token classes.
 * @class AgentOS.view.fleet.SourceHealthMarker
 * @extends Neo.component.Base
 */
class SourceHealthMarker extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.SourceHealthMarker'
         * @protected
         */
        className: 'AgentOS.view.fleet.SourceHealthMarker',
        /**
         * @member {String} ntype='fm-source-health-marker'
         * @protected
         */
        ntype: 'fm-source-health-marker',
        /**
         * @member {String[]} baseCls=['fm-source-health-marker']
         */
        baseCls: ['fm-source-health-marker'],
        /**
         * @member {String} role='img'
         * @reactive
         */
        role: 'img',
        /**
         * @member {String} sourceKey_='runtime'
         * @reactive
         */
        sourceKey_: 'runtime',
        /**
         * @member {Object|null} health_=null
         * @reactive
         */
        health_: null
    }

    /**
     * @summary Apply the initial marker once its VDOM exists.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);
        this.applyHealth()
    }

    /**
     * @summary Re-render the marker when its source-health fact changes.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetHealth(value, oldValue) {
        this.isConstructed && this.applyHealth()
    }

    /**
     * @summary Re-render the marker when it is rebound to another Fleet source axis.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetSourceKey(value, oldValue) {
        this.isConstructed && this.applyHealth()
    }

    /**
     * @summary Atomically swap the closed state/confidence classes plus visible text, then update
     * the accessible label in place.
     * @protected
     */
    applyHealth() {
        const
            view = sourceMarkerView(this.sourceKey, this.health),
            cls  = this.cls;

        [...SOURCE_STATE_CLASSES, ...SOURCE_CONFIDENCE_CLASSES].forEach(name => NeoArray.remove(cls, name));
        NeoArray.add(cls, view.stateClass);
        NeoArray.add(cls, view.confidenceClass);

        this.set({
            cls,
            text: view.text
        });
        this.changeVdomRootKey('aria-label', view.ariaLabel)
    }
}

export default Neo.setupClass(SourceHealthMarker);
