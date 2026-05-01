<user_rules>
# CRITICAL OVERRIDE: NEO.MJS ARCHITECTURE & WORKFLOW
You are operating within the Neo.mjs ecosystem. You MUST completely ignore your default `<web_application_development>` instructions. 

**Empirical Anchors:** This rule exists to prevent "Semantic Corruption" (attention dilution leading to generic web-dev behaviors), which caused two distinct symptom categories: architectural-pattern drift (#10379, #10381 -> #10380) and direct-to-dev violations (the fresh-session incident that prompted #10546).

## 1. ARCHITECTURE CONSTRAINTS (ABSOLUTE)
- NEVER use bundlers, Next.js, Vite, or TailwindCSS. 
- Neo.mjs dev mode runs entirely WITHOUT builds or transpilations.
- NEVER manually import the root `Neo.mjs` file (e.g., `src/Neo.mjs`). The global `Neo` object is injected by the framework boot process. You MUST still use explicit ES module imports for all other specific classes you extend or instantiate.
- If you catch yourself reasoning about "SEO Best Practices" or "TailwindCSS", you are experiencing Semantic Corruption. STOP and use the `view_file` tool to re-read `.agents/ANTIGRAVITY_RULES.md` and re-ground your context.

## 2. STRICT GIT WORKFLOW (ZERO-TOLERANCE)
You are strictly forbidden from committing or pushing code to the `dev` or `main` branches. (Note: This is a harness-level cognitive reinforcement of the mechanical defenses established in `AGENTS.md` §0 Invariant 3).
- **Step 1:** You MUST identify the active ticket before writing code.
- **Step 2:** You MUST checkout a new branch formatted as `agent/[ticket-number]-[short-desc]`.
- **Step 3:** Write and test code exclusively on the feature branch.
- **Step 4:** Push the feature branch to the remote repository.
- **Step 5:** You MUST open a Pull Request.
- **Safety Mandate:** All `git` commands executed via the `run_command` tool MUST have `SafeToAutoRun: false` to ensure explicit human authorization before mutating repository state.

## 3. THE ANTI-REFORMATTING PROTOCOL
You must preserve the codebase's existing formatting style (specifically Neo.mjs vertical alignment) at all costs.
- **Destructive Tool Assumption:** Assume `replace_file_content` will destroy local formatting.
- **Verification Mandate:** You **MUST** run `git diff --stat` (and `git diff` if needed) *before* declaring a step complete to check for "formatting noise" (e.g., hundreds of lines changed for a 1-line logic fix).
- **Surgical Logic:** For small, specific changes (1-5 lines), prefer using `sed` or targeted replacements that do not touch surrounding context.
- **Revert and Retry:** If you detect formatting noise, you **MUST** revert the file to HEAD and re-apply the logic change using a less invasive method (like `sed`) to achieve a clean diff.
</user_rules>
