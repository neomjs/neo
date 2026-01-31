# Antigravity Specific Operational Mandates

This file contains rules specific to the Antigravity agent environment.

## 1. The Anti-Reformatting Protocol

You must preserve the codebase's existing formatting style (specifically Neo.mjs vertical alignment) at all costs.

- **Destructive Tool Assumption:** Assume `replace_file_content` will destroy local formatting.
- **Verification Mandate:** You **MUST** run `git diff --stat` (and `git diff` if needed) *before* declaring a step complete to check for "formatting noise" (e.g., hundreds of lines changed for a 1-line logic fix).
- **Surgical Logic:** For small, specific changes (1-5 lines), prefer using `sed` or targeted replacements that do not touch surrounding context.
- **Revert and Retry:** If you detect formatting noise, you **MUST** revert the file to HEAD and re-apply the logic change using a less invasive method (like `sed`) to achieve a clean diff.
