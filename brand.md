# Splitt visual direction

Status: implementation direction, subject to later brand refinement.

Every page shares one scene: a hand-drawn ink landscape (misty hills, a still lake, pines, two cranes) on cream paper. It appears behind the landing hero, in each app page header, and as the video footer on every page.

- Paper `#f5f2ec` is the page canvas and matches the artwork's paper. The footer video's paper is darker (`#e9e3de`), so the video is lifted with `brightness(1.055) saturate(0.8)` to remove the seam.
- Ink green `#234b3a` for brand, buttons and accents; ink black `#1c2f27` for text. Cards are `#fffdf9` on the paper.
- Amber marks review states; red marks errors. Both are unchanged from the earlier palette.
- Tokens live in `web/app/globals.css` (`:root`), including `--ink-art` for the artwork. Footer tokens live in `web/app/site-footer.css`.
- Space Grotesk for headings and the wordmark, Poppins for interface text, Georgia italic for emphasis.

Voice: clear, specific and calm. Show obligations, eligibility, reserve and settlement state plainly. Never present fixtures as customers or simulated execution as real payment. Amounts use tabular digits and six-decimal base units, trimming trailing zeros for display.
