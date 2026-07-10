/**
 * The Fleet Manager harness-type registry — a thin re-export of the ONE shared Body↔Brain
 * authority (`src/ai/fleet/harnessTypes.mjs`): the same entries validate `defineAgent` /
 * `configureAgent` Brain-side and render every Body picker/label. ADDING A HARNESS IS ONE
 * REGISTRATION — in the seam module, never here: this file exists only so app views keep their
 * conventional `../config/` import path.
 *
 * `label` is the operator-facing product language (surfaces render it verbatim); `type` is the
 * durable key persisted on {@link AgentOS.model.AgentDefinition} records and understood by the
 * Brain-side fleet services.
 */
export {HARNESS_TYPES, listHarnessTypes, resolveHarnessType} from '../../../src/ai/fleet/harnessTypes.mjs';
export {default} from '../../../src/ai/fleet/harnessTypes.mjs';
