# Splitt visual direction

Updated 16 October 2026 following the owner's glass-sphere reference and request for fewer cards.

- A cool light foundation with a deep-blue workflow section: cool pearl canvas `#f0f3f6`, near-white surface `#fbfcfe`, deep ink `#162337`, muted blue-gray `#526176`, restrained blue accent `#456c98`, rules `#d4dce5`.
- Space Grotesk for headings and wordmarks, Poppins for interface copy, Source Serif 4 true italic for emphasis, as requested by the owner. Use sentence case.
- The supplied glass-sphere film anchors the full-height landing hero. Use a quiet static version or lightly visible loop in supporting surfaces. The old warm-paper landscape is superseded.
- Lay out content with whitespace, ruled ledgers and open rows. Avoid nested panels, repeated feature-card grids and heavy shadows. Cards are reserved for the allocation statement: one receipt, two recipients and a reserve strip, with 12px corners and unequal roles. Other sections use open rows.
- Shared public header, consistent page gutters, readable amounts and spacious cinematic footer across the landing page and demo. The owner workspace inherits the same global palette.
- Motion: a short headline entrance, restrained hover feedback and a subtle background loop. Decorative video respects reduced-motion preferences and pauses offscreen or in hidden tabs. The hero and footer have no visible playback controls, as requested by the owner.
- Tokens live in `web/app/globals.css`; public page composition lives in landing.css, site-header.css, site-footer.css and demo/demo.module.css.

Voice: clear, specific and calm. Never present fixtures as customers, simulations as chain payments or a model fallback as an AI success. Amounts retain exact micro-USDC arithmetic and tabular digits.

Institutional content rules: one primary landing CTA; plain Overview/Demo/Documentation navigation; no decorative arrows, floating labels, repeated feature claims or footer sales prompts. Use concise factual headings. Keep technical explanations in /docs, and preserve essential payment confirmations and safety information in the application.

Spacing correction: concise copy must retain generous visual space. Use full-width color bands: paper for the allocation, deep blue (#183a60) with white text for the interactive workflow, paper for controls, blue mist for FAQs, and glacier for the cinematic footer. Avoid yellow or warm section backgrounds. Keep the ink text, accent and fonts consistent. The footer has a large wordmark and quiet glass scene, with a short product description beneath the wordmark, plus documentation, source and copyright text. No sales prompts or feature lists return. Mobile keeps intentional section padding rather than collapsing the design into dense strips.

Landing interactions: one-time staggered card and section reveals, explanatory reserve bars, and a three-stage workflow preview controlled by native buttons. No autoplaying workflow or moving monetary text. Respect reduced motion; static content remains available without JavaScript. Six native FAQ disclosures replace About Splitt. Dollar examples are labeled USD; settlement remains USDC.
