# Visual feedback and UI polish

Installed the requested `better-ui`, `animate` and `agentation` skills from 23jmo/jmo-skills locally. They become discoverable on the next agent turn. Agentation 3.1.2 is a pinned web development dependency.

## Manual feedback

Start `npm run dev -w @splitt/web`, then open http://localhost:3000/demo. The development-only Agentation toolbar sits at the bottom-right. Activate it, select an element, write a note, then use Copy and paste the output into the chat. The copied output identifies the element and page.

No endpoint, webhook or MCP server is configured. Feedback remains in the browser until the owner copies and shares it. The toolbar is omitted from the production Vercel site by the NODE_ENV guard in the root layout. The root remains a server component; Agentation supplies its own client boundary.

## Applied principles

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Medium | web/app/landing.css, site-header.css, site-footer.css | Hover styles could latch after touch input | Hover rules require a hover-capable fine pointer | Avoid stuck hover states on touch |
| Medium | web/app/landing.tsx and landing.css | Payment-stage selection remounted a figure and replayed its entrance | Amounts update immediately without the replay | Keep frequently inspected financial values stable |
| Low | web/app/landing.tsx and demo/page.tsx | Motion used y shorthands and unrelated timings | Full transform strings, a 300ms entry and a shared easing | Explain the first appearance of content without layout animation |
| Low | web/app/site-header.css and demo/demo.module.css | No consistent press feedback | 150ms press to 0.96; disabled and data-static-press controls excluded; reduced motion respected | Confirm deliberate activation consistently |
| Low | web/app/site-header.css | Mobile menu could pass overscroll to the page | Contained scrolling with a viewport height bound | Keep overlay interaction within the menu |

Approve for the inspected source states only. TypeScript and the production build passed. Browser inspection remains blocked by the browser security policy: toolbar activation, selecting an actual element, clipboard output, real-device touch behavior and animation feel are **not verified**. Complete the local select → note → Copy → paste check before treating manual feedback as end-to-end verified. No live-sync capability is claimed.
