# Memory-consolidation post render evidence

Evidence-only branch; do not merge it into the product. Product source is 659c38b80b607546a1b843bddc547874d01c14f4, the post plus its blog.json registration.

The actual Portal route and page-bound Worker selected blog/ai-agent-memory-consolidation at 1440 and 375, dark and light. Four cases pass: one flowchart SVG, nine unscaled 16px labels, no label clipping or article horizontal overflow, zero browser errors. SVG glyph colour midnightblue on aliceblue yields 13.8409:1 contrast. The 216px-wide, roughly 881px-tall diagram is read by vertical scrolling; start/end screenshots are actual Portal viewport frames, not a claim that the entire diagram fits in one viewport.

The source-local Mermaid root htmlLabels:false setting uses SVG text, with named node/link colours. The initial HTML-label variant had black paragraph glyphs on dark nodes in light mode, caused by Global paragraph colour inheritance. A diagram-specific htmlLabels setting did not override the root setting; the supported root option did. The final source is what this packet renders. No global component or theme was patched.

Run render.cjs from the matching Engine checkout with dependencies, generated development themes and Chrome available. It uses the maintained dedicated-worker Neural Link adapter and starts no Brain/Bridge. Source hashes bind the tested inputs. The public receipt omits the original machine root, ephemeral origin and local screenshot paths; these are not evidence inputs. All owned browsers and server were closed. Links are extracted here; this render packet does not claim to perform the independent final fact check.
