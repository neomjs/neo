/**
 * @module ai/services/memory-core/helpers/chatModelGenerate
 * @summary Adapts the Memory Core chat-model builder into the `generate({prompt}) => string` seam the
 * temporal synthesis adapter calls — the one edge that turns the deployment-agnostic `modelProvider` SSOT
 * into a narrative for a Bird View.
 *
 * The model BUILDER is injected (`buildModel`), so the provider selection (local gemma via
 * openAiCompatible/ollama, or remote gemini) stays the reactive-Provider SSOT's job and this adapter stays
 * hermetically testable. A missing provider (e.g. gemini with no API key) or an empty completion THROWS,
 * so the Bird View orchestrator degrades the envelope rather than emitting an empty "what happened" — the
 * synthesis path fails loud where `buildMiniSummary` (a fire-and-forget write-path summary) fails soft.
 */

const DEFAULT_OPERATION_LABEL = 'temporal bird view synthesis';

/**
 * @summary Builds a `generate({prompt}) => Promise<String>` closure over an injected chat-model builder.
 * @param {Object} options
 * @param {Function} options.buildModel `() => model | null` — the injected model builder (real caller wraps `buildChatModel`).
 * @param {Number} [options.timeoutMs] Generation timeout passed to `model.generateContent`.
 * @param {String} [options.operationLabel='temporal bird view synthesis'] Label for the model call telemetry.
 * @returns {Function} `async ({prompt}) => string` (the narrative text).
 */
export function makeChatModelGenerate({buildModel, timeoutMs, operationLabel = DEFAULT_OPERATION_LABEL} = {}) {
    if (typeof buildModel !== 'function') {
        throw new Error('makeChatModelGenerate: an injected `buildModel` function is required')
    }

    return async function generate({prompt}) {
        const model = buildModel();

        if (!model) {
            // no configured provider (e.g. gemini without an API key) — fail loud so synthesis degrades
            throw new Error('makeChatModelGenerate: no chat model provider is configured')
        }

        const result = await model.generateContent(prompt, {timeoutMs, operationLabel, priority: 'interactive'}),
              text   = result?.response?.text?.() ?? null;

        if (typeof text !== 'string' || text.length === 0) {
            throw new Error('makeChatModelGenerate: the chat model returned no text')
        }

        return text
    }
}
