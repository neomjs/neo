import ActorChip          from './ActorChipComponent.mjs';
import Component          from '../../../../../src/component/Base.mjs';
import Container          from '../../../../../src/container/Base.mjs';
import EventChip          from './EventChipComponent.mjs';
import {formatViewerTime} from '../../../util/viewerTime.mjs';

/**
 * @summary Resolves the producer-owned object/message carried by one activity event.
 *
 * Actor and recipient render in their own fixed cells, so this function never repeats them. PR,
 * issue, lane and stall payloads prefer their stable object reference + title; A2A and fixture
 * events use their bounded subject/text. Unknown shapes degrade to the event kind, never an object
 * stringification.
 * @param {Object} event Record or record-shaped object.
 * @returns {String}
 */
export function getActivityObjectText(event) {
    const
        payload = event?.payload || {},
        subject = Neo.typeOf(payload.subject) === 'Object' ? payload.subject : null,
        number  = payload.number ?? payload.issueNumber ?? subject?.number ?? null,
        id      = number === null ? (subject?.id ?? null) : null,
        ref     = number !== null ? `#${number}` : id,
        title   = payload.title ?? payload.issueTitle ?? subject?.title ?? null,
        object  = [ref, title].filter(value => typeof value === 'string' && value || typeof value === 'number').join(' · '),
        text    = [payload.text, payload.summary, typeof payload.subject === 'string' ? payload.subject : null, payload.reason]
            .find(value => typeof value === 'string' && value.trim());

    if (object) {
        return event?.type === 'work-stall' ? `stalled · ${object}` : object
    }

    if (text) {
        return text
    }

    if (event?.type === 'work-stall') {
        return `stalled · ${payload.findingClass || 'work item'}`
    }

    return event?.type || 'fleet event'
}

/**
 * @summary One physically pooled activity row with a stable five-cell child tree.
 *
 * {@link Neo.list.Buffered} recycles this component by assigning {@link #record}. Every recycle
 * updates the existing time, kind, actor, recipient and object component roots in place; empty
 * optional cells stay mounted and visually inert. The producer record remains the only event truth.
 * @class AgentOS.view.fleet.activity.RowContainer
 * @extends Neo.container.Base
 */
class RowContainer extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.activity.RowContainer'
         * @protected
         */
        className: 'AgentOS.view.fleet.activity.RowContainer',
        /**
         * @member {String} ntype='fm-activity-row'
         * @protected
         */
        ntype: 'fm-activity-row',
        /**
         * @member {String[]} baseCls=['fm-activity-row']
         */
        baseCls: ['fm-activity-row'],
        /**
         * Roster facts supplied by the cockpit owner; missing facts keep the canonical handle.
         * @member {Object} actorDirectory_={}
         * @reactive
         */
        actorDirectory_: {},
        /**
         * The current Store record assigned to this physical pool slot.
         * @member {Neo.data.Record|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * The fixed child anatomy. CSS changes only the grid placement at narrow widths; the
         * component and DOM tree never changes shape.
         * @member {Object[]}
         */
        items: [{
            module   : Component,
            cls      : ['fm-ev-time'],
            reference: 'time'
        }, {
            module   : EventChip,
            reference: 'kind'
        }, {
            module   : ActorChip,
            reference: 'actor'
        }, {
            module   : Component,
            cls      : ['fm-ev-recipient'],
            reference: 'recipient'
        }, {
            module   : Component,
            cls      : ['fm-ev-object'],
            reference: 'object'
        }]
    }

    /** @param {Object} value @param {Object} oldValue @protected */
    afterSetActorDirectory(value, oldValue) {
        this.isConstructed && this.updateRow()
    }

    /** @param {Neo.data.Record|null} value @param {Neo.data.Record|null} oldValue @protected */
    afterSetRecord(value, oldValue) {
        this.isConstructed && this.updateRow()
    }

    /** @param {...*} args */
    onConstructed(...args) {
        super.onConstructed(...args);
        this.updateRow()
    }

    /**
     * @summary Rebinds the stable child cells to the current producer record.
     * @protected
     */
    updateRow() {
        const
            me      = this,
            event   = me.record,
            agentId = event?.agentId || null,
            facts   = agentId
                ? me.actorDirectory?.[agentId] ?? me.actorDirectory?.[String(agentId).replace(/^@/, '')] ?? {}
                : {},
            time      = formatViewerTime(event?.occurredAt),
            recipient = me.getRecipient(event),
            timeCell  = me.getReference('time'),
            kindCell  = me.getReference('kind'),
            actorCell = me.getReference('actor'),
            toCell    = me.getReference('recipient'),
            textCell  = me.getReference('object'),
            text      = getActivityObjectText(event);

        if (!timeCell || !kindCell || !actorCell || !toCell || !textCell) {
            return
        }

        timeCell.vdom.title = time?.title ?? null;
        timeCell.setSilent({text: time?.text ?? '—'});

        kindCell.setSilent({kind: event?.type || 'unknown'});

        actorCell.setSilent({
            agentId,
            avatarUrl: facts.avatarUrl ?? null,
            cls      : ['fm-actor-chip', ...(!agentId ? ['is-empty'] : [])],
            hidden   : false,
            label    : facts.displayName ?? null
        });

        toCell.vdom.title = recipient?.title ?? null;
        toCell.setSilent({
            cls   : ['fm-ev-recipient', recipient?.broadcast ? 'is-broadcast' : 'is-direct', ...(!recipient ? ['is-empty'] : [])],
            hidden: false,
            text  : recipient?.text ?? ''
        });

        textCell.setSilent({text});

        me.vdom['aria-label'] = [time?.text, event?.type, agentId, recipient?.text, text].filter(Boolean).join(' · ');
        me.updateDepth = 2;
        me.update()
    }

    /**
     * @summary Resolves the optional A2A recipient cell without deriving identity.
     * @param {Object|null} event
     * @returns {Object|null}
     * @protected
     */
    getRecipient(event) {
        const
            payload   = event?.payload || {},
            isA2A     = event?.type === 'a2a-activity' || event?.type === 'lane-claim',
            to        = typeof payload.to === 'string' && payload.to ? payload.to : null,
            broadcast = payload.recipientClass === 'broadcast';

        if (!isA2A || (!to && !broadcast)) {
            return null
        }

        return {
            broadcast,
            text : broadcast ? '⇒ fleet' : `→ ${to}`,
            title: to ?? 'AGENT:*'
        }
    }
}

export default Neo.setupClass(RowContainer);
