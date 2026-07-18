/**
 * @module ai/scripts/benchmark/redproof-codeql-extraction
 * @summary DELIBERATE, TEMPORARY red-proof fixture for the CodeQL extraction guard — removed in the
 * very next commit once the RED receipt is captured; imported by nothing, run by nothing.
 *
 * The statement-initial `import.meta` below is valid to Node's parser (so every lint + the parse gate
 * accept it) but UNPARSEABLE to CodeQL's JS extractor — it is ambiguous with an `import` declaration
 * until the `.`, so CodeQL drops this WHOLE file from analysis and reports one processing warning while
 * the alert-gate still says pass. That is exactly the silent coverage loss the extraction guard exists
 * to catch: this commit's CodeQL run must turn the guard RED naming this file; removing it turns it GREEN.
 */

import.meta.url;
