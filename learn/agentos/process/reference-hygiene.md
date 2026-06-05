# Reference Hygiene for GitHub Issue Tokens

GitHub auto-links bare `#N` in rendered markdown, and the Native Edge Graph treats issue-token matches as relationship evidence. When authoring tickets, PRs, reviews, or discussions, separate intentional graph edges from descriptive prose.

## Structural References Stay Bare

Keep the token bare when the reference itself is the intended relationship:

- `Resolves #N` / `Closes #N` / `Fixes #N` close keywords
- `Refs #N` / `Related: #N` when the PR body intentionally links a non-closing issue
- `BLOCKED_BY #N` relationship metadata
- Conventional-commit subjects such as `feat(scope): message (#N)`
- Graduation markers such as `[GRADUATED_TO_TICKET: #N]`
- Structured tool payloads such as `update_issue_relationship`

## Descriptive References Use Backticks

Backtick-escape the token when the prose is only context, provenance, or comparison:

- "See `#N` for context"
- "Mirrors the pattern from `#N`"
- "Filed alongside `#N`"
- `[KB_GAP]`, `[TOOLING_GAP]`, `[RETROSPECTIVE]`, evidence notes, and rationale text that mention issue numbers descriptively

Rule of thumb: if the reference IS the relationship edge, keep it bare. If it explains context without asserting a relationship, backtick-escape the token.
