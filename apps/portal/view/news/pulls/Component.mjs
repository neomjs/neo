import ContentComponent from '../../content/Component.mjs';
import {marked}         from '../../../../../node_modules/marked/lib/marked.esm.js';

const
    regexFrontMatter = /^---\n([\s\S]*?)\n---\n/,
    regexH1          = /(<h1[^>]*>.*?<\/h1>)/,
    // Section extractors: a section runs from its `## ` heading to the next `## ` heading or EOF.
    regexComments    = /\n## Comments\s*\n([\s\S]*?)(?=\n## [A-Z]|$)/,
    regexReviews     = /\n## Reviews\s*\n([\s\S]*?)(?=\n## [A-Z]|$)/,
    // Entry-split headers. The backtick-wrapped `@user` is the discriminator: review/comment
    // *bodies* carry their own bare `###` sub-headers and `---` rules, so we split ONLY here.
    regexCommentHdr  = /^### `@([\w.-]+)` commented on ([\dTZ:.+-]+)\s*$/,
    regexReviewHdr   = /^### `@([\w.-]+)` \(([A-Z_]+)\) reviewed on ([\dTZ:.+-]+)\s*$/;

/**
 * @summary The "Markdown Transformer" for GitHub Pull Requests.
 *
 * Sibling to `Portal.view.news.tickets.Component`, specialized for the PR `.md` grammar emitted by
 * the portal `pulls` generator. The irreducible difference from the Issue timeline is the source
 * shape: a PR carries **two** separately-ordered sections — `## Comments` and `## Reviews` — rather
 * than one pre-merged `## Timeline`. This component:
 *
 * 1. **Two-section entry-split**: extracts `## Comments` + `## Reviews`, splitting each into entries
 *    ONLY at the `` ### `@user` `` header boundary — never at bare `---` or inner `###`, because
 *    review bodies (PR-review templates) contain their own `###` sub-headers and `---` rules.
 * 2. **Merge-sort**: the two sections are not globally ordered, so entries are merged and sorted by
 *    ISO timestamp into a single chronological timeline.
 * 3. **Review-state coloring**: `APPROVED` → green, `CHANGES_REQUESTED` → red, everything else
 *    (`COMMENTED` / `DISMISSED` / unknown) → a neutral fallback (never throws).
 * 4. **3-state badge**: PRs are `OPEN` / `MERGED` / `CLOSED` (the 2-state issue badge mislabels MERGED).
 * 5. **Graceful degrade**: a body-only PR (e.g. a dependabot PR with no comments/reviews) still
 *    renders its description via `super.modifyMarkdown` with no timeline entries.
 *
 * **Side Effect**: populates `me.timelineData` and pushes it to the `sections` store to drive the
 * shared `TimelineCanvas`.
 *
 * @class Portal.view.news.pulls.Component
 * @extends Neo.app.content.Component
 */
class Component extends ContentComponent {
    static config = {
        /**
         * @member {String} className='Portal.view.news.pulls.Component'
         * @protected
         */
        className: 'Portal.view.news.pulls.Component',
        /**
         * @member {String[]} cls=['portal-news-pulls-component']
         */
        cls: ['portal-news-pulls-component'],
        /**
         * `#N` references in PR bodies are issue numbers → resolve to the portal tickets view.
         * Per-content-type config: the generic content base no longer defaults this.
         * @member {String} issuesUrl='#/news/tickets/'
         */
        issuesUrl: '#/news/tickets/',
        /**
         * @member {String} repoUserUrl='https://github.com/'
         */
        repoUserUrl: 'https://github.com/'
    }

    /**
     * Temporary storage for the structured timeline data extracted during parsing; assigned to the
     * `sections` store to drive the Canvas, then nulled.
     * @member {Object[]} timelineData=null
     * @private
     */
    timelineData = null

    /**
     * Renders the PR frontmatter table, with PR-specific renderers for `state` (3-state badge),
     * `base`/`head` (the `base ← head` ref pair), `url`, and `mergedAt`.
     * @param {Object} data
     * @returns {String}
     */
    frontMatterToHtml(data) {
        let me   = this,
            html = '<table class="neo-frontmatter-table"><tbody>',
            // `head` is rendered inline with `base`; skip its own row.
            skip = {head: true, number: true};

        Object.entries(data).forEach(([key, value]) => {
            if (skip[key]) return;

            let renderedValue;

            if (key === 'author') {
                renderedValue = `<a href="${me.repoUserUrl}${value}" target="_blank">${value}</a>`
            } else if (key === 'createdAt' || key === 'closedAt' || key === 'updatedAt' || key === 'mergedAt') {
                renderedValue = me.formatTimestamp(value)
            } else if (key === 'state') {
                renderedValue = me.getStateBadgeHtml(value)
            } else if (key === 'base') {
                renderedValue = `<code>${data.base}</code> &larr; <code>${data.head ?? ''}</code>`
            } else if (key === 'url') {
                renderedValue = `<a href="${value}" target="_blank">${value}</a>`
            } else {
                renderedValue = me.formatFrontMatterValue(value)
            }

            html += `<tr><td>${key === 'base' ? 'branches' : key}</td><td>${renderedValue}</td></tr>`
        });

        html += '</tbody></table>';

        if (me.useFrontmatterDetails) {
            return `<details id="neo-pr-summary-details-${me.id}"><summary>Frontmatter</summary>${html}</details>`
        }

        return html
    }

    /**
     * 3-state PR status badge. `OPEN` (green), `MERGED` (purple), `CLOSED` (red).
     * @param {String} state
     * @returns {String}
     */
    getStateBadgeHtml(state) {
        if (!state) return '';

        let s    = state.toUpperCase(),
            cls  = 'neo-badge neo-state-badge',
            icon = 'fa-circle-dot';

        if (s === 'MERGED') {
            cls += ' neo-state-merged'; icon = 'fa-code-merge'
        } else if (s === 'CLOSED') {
            cls += ' neo-state-closed'; icon = 'fa-circle-xmark'
        } else {
            cls += ' neo-state-open'; icon = 'fa-circle-dot'
        }

        return `<span class="${cls}"><i class="fa-solid ${icon}"></i>${Neo.capitalize(s.toLowerCase())}</span>`
    }

    /**
     * Maps a review state to a semantic CSS modifier. Unknown / `COMMENTED` / `DISMISSED` states
     * fall through to the neutral default — never throws.
     * @param {String} state
     * @returns {String}
     */
    getReviewStateCls(state) {
        switch ((state || '').toUpperCase()) {
            case 'APPROVED':          return 'neo-review-approved';
            case 'CHANGES_REQUESTED': return 'neo-review-changes';
            default:                  return 'neo-review-neutral'
        }
    }

    /**
     * The Main Parsing Pipeline (PR variant). Extracts frontmatter + body + the two `## Comments`
     * and `## Reviews` sections, merges the section entries into one chronological timeline, and
     * re-assembles Frontmatter + Title + Badges + Timeline. Populates `me.timelineData`.
     * @param {String} content
     * @returns {String}
     */
    modifyMarkdown(content) {
        let me           = this,
            match        = content.match(regexFrontMatter),
            data         = match ? me.parseFrontMatter(match[1]) : {},
            author       = data.author    || null,
            createdAt    = data.createdAt ? me.formatTimestamp(data.createdAt) : '',
            state        = data.state     || null;

        me.timelineData = [];

        // 1. Extract the two sections from the RAW markdown, then strip them (+ frontmatter) so the
        //    remainder is just the PR description body.
        let commentsMatch = content.match(regexComments),
            reviewsMatch  = content.match(regexReviews),
            entries       = me.parseEntries(commentsMatch?.[1] || '', reviewsMatch?.[1] || '');

        content = content
            .replace(regexComments, '')
            .replace(regexReviews,  '')
            .replace(regexFrontMatter, '');

        // 2. Render the description body via super (marked.js).
        let fullHtml = super.modifyMarkdown(content);

        // 3. Lift the H1 title out of the body bubble.
        let titleHtml = '';
        fullHtml      = fullHtml.replace(regexH1, m => {
            titleHtml = m.replace('<h1', `<h1 id="pr-title-${me.id}"`);
            return ''
        });

        // 4. Status badge under the title.
        if (state) {
            titleHtml += `<div class="neo-ticket-labels">${me.getStateBadgeHtml(state)}</div>`
        }

        // 5. Description as the first timeline item.
        let bodyId = `timeline-${me.record.id}-0`;

        me.timelineData.push({
            id   : bodyId,
            ...me.getAvatarRecordProps(author),
            name : 'Description',
            tag  : 'body'
        });

        let timelineHtml = `<div id="pr-timeline-${me.id}" class="neo-ticket-timeline">` +
            me.renderBubble({id: bodyId, user: author, date: createdAt, bodyHtml: fullHtml, extraCls: 'comment body-item'});

        // 6. Merged comment + review entries, in chronological order.
        entries.forEach((entry, index) => {
            let id       = `timeline-${me.record.id}-${index + 1}`,
                isReview = entry.type === 'review',
                stateCls = isReview ? me.getReviewStateCls(entry.state) : '',
                badge    = isReview ? `<span class="neo-badge neo-review-state ${stateCls}">${entry.state}</span>` : '';

            me.timelineData.push({
                id,
                ...me.getAvatarRecordProps(entry.user),
                name : isReview ? `Review (${entry.user})` : `Comment (${entry.user})`,
                tag  : entry.type
            });

            timelineHtml += me.renderBubble({
                id,
                user    : entry.user,
                date    : entry.date,
                bodyHtml: me.wrapMarkdownTables(marked.parse(entry.body)),
                extraCls: isReview ? `comment review ${stateCls}` : 'comment',
                action  : isReview ? `${badge} reviewed` : 'commented',
                meta    : entry.meta
            })
        });

        timelineHtml += '</div>';

        me.getStateProvider().getStore('sections').data = me.timelineData;
        me.timelineData = null;

        return me.frontMatterToHtml(data) + titleHtml + timelineHtml
    }

    /**
     * Splits the `## Comments` and `## Reviews` raw bodies into entries at the `` ### `@user` ``
     * header boundary (never at inner `###` / `---`), then merges + sorts them by ISO timestamp.
     * @param {String} commentsRaw
     * @param {String} reviewsRaw
     * @returns {Object[]} `[{type, user, date, state?, body}]` sorted ascending by `date`.
     */
    parseEntries(commentsRaw, reviewsRaw) {
        const split = (raw, headerRegex, build) => {
            let lines   = raw.split('\n'),
                entries = [],
                current = null,
                i       = 0,
                len     = lines.length,
                m;

            for (; i < len; i++) {
                if ((m = lines[i].match(headerRegex))) {
                    current && entries.push(current);
                    current = build(m)
                } else if (current) {
                    current.bodyLines.push(lines[i])
                }
            }

            current && entries.push(current);

            return entries.map(e => ({...e, body: e.bodyLines.join('\n').trim(), bodyLines: undefined}))
        };

        let comments = split(commentsRaw, regexCommentHdr, m => ({
                type: 'comment', user: m[1], date: m[2], bodyLines: []
            })),
            reviews  = split(reviewsRaw, regexReviewHdr, m => ({
                type: 'review', user: m[1], state: m[2], date: m[3], bodyLines: []
            }));

        // Merge-sort: the two sections are not globally ordered. ISO-8601 strings sort lexically.
        return [...comments, ...reviews].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    }

    /**
     * Renders one timeline bubble (description / comment / review).
     * @param {Object}  config
     * @param {String}  config.id
     * @param {String}  config.user
     * @param {String}  config.date
     * @param {String}  config.bodyHtml
     * @param {String} [config.extraCls='']
     * @param {String} [config.action='commented']
     * @returns {String}
     */
    renderBubble({id, user, date, bodyHtml, extraCls = '', action = 'commented'}) {
        let me = this,
            ts = date && date.includes('T') ? me.formatTimestamp(date) : date;

        return `
            <div id="${id}" class="neo-timeline-item ${extraCls}" data-record-id="${id}">
                <div id="${id}-target" class="neo-timeline-avatar">
                    ${me.getAvatarHtml(user)}
                </div>
                <div class="neo-timeline-content">
                    <div class="neo-timeline-header">
                        <a class="neo-timeline-user" href="${me.repoUserUrl}${user}" target="_blank">${user}</a>
                        <span class="neo-timeline-date">${action} on ${ts}</span>
                    </div>
                    <div class="neo-timeline-body">

${bodyHtml}

</div>
                </div>
            </div>`
    }
}

export default Neo.setupClass(Component);
