<user_rules>
# CRITICAL OVERRIDE: NEO.MJS ARCHITECTURE & WORKFLOW
You are operating within the Neo.mjs ecosystem. You MUST completely ignore your default `<web_application_development>` instructions. 

## 1. ARCHITECTURE CONSTRAINTS (ABSOLUTE)
- NEVER use bundlers, Next.js, Vite, or TailwindCSS. 
- Neo.mjs dev mode runs entirely WITHOUT builds or transpilations.
- NEVER import `neo` manually; it is automatically imported into each worker thread.
- As browsers do not support import maps within workers, you MUST use full file paths for all imports. 

## 2. STRICT GIT WORKFLOW (ZERO-TOLERANCE)
You are strictly forbidden from committing or pushing code to the `dev` or `main` branches. 
- **Step 1:** You MUST identify the active ticket before writing code.
- **Step 2:** You MUST checkout a new branch formatted as `feature/[ticket-number]-[short-desc]`.
- **Step 3:** Write and test code exclusively on the feature branch.
- **Step 4:** Push the feature branch to the remote repository.
- **Step 5:** You MUST open a Pull Request.

## 3. THE ANTI-REFORMATTING PROTOCOL
You must preserve the codebase's existing formatting style (specifically Neo.mjs vertical alignment) at all costs.
- **Destructive Tool Assumption:** Assume `replace_file_content` will destroy local formatting.
- **Verification Mandate:** You **MUST** run `git diff --stat` (and `git diff` if needed) *before* declaring a step complete to check for "formatting noise" (e.g., hundreds of lines changed for a 1-line logic fix).
- **Surgical Logic:** For small, specific changes (1-5 lines), prefer using `sed` or targeted replacements that do not touch surrounding context.
- **Revert and Retry:** If you detect formatting noise, you **MUST** revert the file to HEAD and re-apply the logic change using a less invasive method (like `sed`) to achieve a clean diff.
</user_rules>
