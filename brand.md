# Splitt visual direction

Updated 16 October 2026 following the owner's glass-sphere reference and request for fewer cards.

- One light theme throughout: cool pearl canvas `#f0f3f6`, near-white surface `#fbfcfe`, deep ink `#162337`, muted blue-gray `#526176`, restrained blue accent `#456c98`, rules `#d4dce5`.
- Space Grotesk for headings and wordmarks, Poppins for interface copy, Source Serif 4 true italic for emphasis, as requested by the owner. Use sentence case.
- The supplied glass-sphere film anchors the full-height landing hero. Use a quiet static version or lightly visible loop in supporting surfaces. The old warm-paper landscape is superseded.
- Lay out content with whitespace, ruled ledgers and open rows. Avoid nested panels, repeated feature-card grids and heavy shadows. Pills are reserved for navigation and primary controls; ledger surfaces have square edges.
- Shared public header, consistent page gutters, readable amounts and spacious cinematic footer across the landing page and demo. The owner workspace inherits the same global palette.
- Motion: a short headline entrance, restrained hover feedback and a subtle background loop. Pause control, reduced-motion preference, offscreen pausing and hidden-tab pausing are required for decorative video.
- Tokens live in `web/app/globals.css`; public page composition lives in landing.css, site-header.css, site-footer.css and demo/demo.module.css.

Voice: clear, specific and calm. Never present fixtures as customers, simulations as chain payments or a model fallback as an AI success. Amounts retain exact micro-USDC arithmetic and tabular digits.

Institutional content rules: one primary landing CTA; plain Overview/Demo/Documentation navigation; no decorative arrows, floating labels, repeated feature claims or footer sales prompts. Use concise factual headings. Keep technical explanations in /docs, and preserve essential payment confirmations and safety information in the application.

Spacing correction: concise copy must retain generous visual space. Use full-width light color bands: paper for the payment example, blue mist for the workflow, warm stone for controls, pearl for product information, and glacier for the cinematic footer. Keep the ink text, accent and fonts consistent. The footer has a large wordmark and quiet glass scene, with only documentation, source and copyright text. No sales prompts or feature lists return. Mobile keeps intentional section padding rather than collapsing the design into dense strips.
