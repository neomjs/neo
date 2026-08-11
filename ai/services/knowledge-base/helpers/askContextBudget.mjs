/**
 * @summary Assembles the ask-synthesis context under a character budget, reporting what it dropped.
 *
 * `limit` bounds how MANY documents `ask_knowledge_base` retrieves; nothing bounded their SIZE. The
 * context was every hit's whole file joined together, so request cost was decided by whatever ranked
 * top-`limit`: one guide in the corpus is ~18,800 tokens by itself and the five largest total
 * ~73,900. Two large documents therefore exceed a deadline that five small ones fit inside — which is
 * why lowering `limit` relocates the cliff instead of removing it, and why this bound counts
 * characters rather than documents.
 *
 * Characters, not tokens: a character budget is exact and provider-independent, while a token budget
 * needs the selected model's tokenizer and would silently mis-bound the moment the ask model changes.
 *
 * Two bounds, because a total-only budget has a failure mode of its own: one oversized document
 * consumes the whole allowance and the synthesis never sees the ranked-second document that would
 * have answered the question. Each document is capped first, then the total is enforced.
 *
 * Lives in `helpers/` and imports nothing: it is a pure string function, so it stays Neo-free (ADR
 * 0019 C1) and is drivable in a spec without booting a service. Asserting the bound through
 * `SearchService.ask()` alone would mean re-deriving the expected string in the test, which proves
 * the arithmetic rather than the contract.
 * @module Neo.ai.services.knowledgeBase.helpers.askContextBudget
 */

const SEPARATOR = '\n\n';

/**
 * @summary Builds one document block's header. Kept beside the assembler so the format has one owner.
 * @param {Object} doc
 * @param {Number} position 1-based rank position.
 * @returns {String}
 * @private
 */
function documentHeader(doc, position) {
    return `--- DOCUMENT ${position} (${doc.name} from ${doc.source}) ---\n`
}

/**
 * @summary Assembles the bounded context for one ask synthesis.
 *
 * A document is DROPPED rather than emitted headerless when the remaining budget cannot hold its
 * header: a header with no body reads to the synthesis model as an empty source, which is the phantom
 * `No Content (File missing or empty)` failure the retrieval path already carries scar tissue for.
 *
 * @param {Object} options
 * @param {Object[]} [options.documents=[]] `{name, source, content}` in rank order.
 * @param {Number} [options.budgetChars=0] Total character budget; `0` disables the bound, which is
 * what an overlay predating the leaf resolves to — an unmigrated clone keeps today's behaviour rather
 * than acquiring a truncation nobody configured.
 * @param {Number} [options.maxCharsPerDocument=0] Per-document cap; `0` disables it.
 * @returns {{context: String, truncated: Boolean, notice: String, includedCount: Number, droppedCount: Number}}
 */
export function assembleAskContext({documents = [], budgetChars = 0, maxCharsPerDocument = 0} = {}) {
    const
        blocks    = [],
        shortened = [];

    let consumed = 0,
        dropped  = 0;

    documents.forEach((doc, index) => {
        const
            position = index + 1,
            header   = documentHeader(doc, position),
            // The separator is charged to every block after the first, so the accounting matches the
            // string actually produced rather than the sum of its parts. Accounting per-document while
            // joining overspends by (n-1) * SEPARATOR.length — the kind of off-by-a-little that makes a
            // bound "mostly" hold and then fail on the body that matters.
            overhead = header.length + (blocks.length > 0 ? SEPARATOR.length : 0);

        let content = doc.content ?? '';

        if (maxCharsPerDocument > 0 && content.length > maxCharsPerDocument) {
            content = content.slice(0, maxCharsPerDocument);
            shortened.push(position)
        }

        if (budgetChars > 0) {
            const remaining = budgetChars - consumed - overhead;

            if (remaining <= 0) {
                dropped++;
                return
            }

            if (content.length > remaining) {
                content = content.slice(0, remaining);

                if (!shortened.includes(position)) {
                    shortened.push(position)
                }
            }
        }

        consumed += overhead + content.length;
        blocks.push(`${header}${content}`)
    });

    const truncated = shortened.length > 0 || dropped > 0;

    return {
        context      : blocks.join(SEPARATOR),
        truncated,
        notice       : truncated ? buildTruncationNotice({budgetChars, maxCharsPerDocument, shortened, dropped}) : '',
        includedCount: blocks.length,
        droppedCount : dropped
    }
}

/**
 * @summary States what the budget removed, in the answer's own voice.
 *
 * "Something was truncated" is not actionable. A caller deciding whether to re-ask with a narrower
 * query needs to know whether material was SHORTENED or DROPPED OUTRIGHT, so the two are named
 * separately rather than collapsed into one flag.
 * @param {Object} options
 * @param {Number} options.budgetChars
 * @param {Number} options.maxCharsPerDocument
 * @param {Number[]} options.shortened 1-based positions of shortened documents.
 * @param {Number} options.dropped
 * @returns {String}
 * @private
 */
function buildTruncationNotice({budgetChars, maxCharsPerDocument, shortened, dropped}) {
    const parts = [
        `Context note: the retrieved sources exceeded this deployment's ask context budget`,
        budgetChars > 0 ? ` (${budgetChars} characters` : ' (unbounded total',
        maxCharsPerDocument > 0 ? `, ${maxCharsPerDocument} per document).` : ').'
    ];

    if (shortened.length > 0) {
        parts.push(` Document(s) ${shortened.join(', ')} were shortened.`)
    }

    if (dropped > 0) {
        parts.push(` ${dropped} lower-ranked document(s) were omitted entirely.`)
    }

    parts.push(' The answer above may therefore be scoped to part of the available material.');

    return parts.join('')
}
