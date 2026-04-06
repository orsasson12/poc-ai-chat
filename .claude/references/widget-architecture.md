# Widget & Iframe Architecture Reference

## Why Iframe
1. Security isolation — browser-enforced boundary, no shared vars/keys/DOM
2. Zero-conflict deployment — no dependency on host page frameworks
3. Instant updates — bug fixes reach all widgets on next page load

## Widget Delivery Sequence
1. Browser loads business website
2. Parses `<script src="cdn.bizassist.ai/widget.js" data-assistant-id="biz_xxx">`
3. widget.js executes (vanilla JS, ~12KB, no dependencies)
4. Reads data-assistant-id from script tag
5. Fetches GET /api/widget/[id]/config (edge cached 60s)
6. Renders floating chat bubble (position configurable)
7. On click: creates `<iframe src="app.bizassist.ai/chat/[id]?session=[uuid]">`
8. iframe loads: server component fetches config
9. Renders ChatWindow with greeting
10. Customer types → POST /api/chat → streams response

## widget.js Spec
- Vanilla TypeScript → plain JS, zero npm dependencies
- Target: <15KB minified + gzipped
- data-* attributes: assistant-id (required), color (optional), position (optional)
- Session ID in sessionStorage
- Lazy iframe creation (not on page load)
- postMessage with origin validation
- Silent failure if config fetch fails

## Iframe Sandbox
`allow-scripts allow-forms allow-same-origin`
- No top-level navigation
- No popups
- No host page origin access

## Platform Embedding
| Platform | Method |
|---|---|
| Any HTML | `<script>` before `</body>` |
| WordPress | Plugin or Insert Headers and Footers |
| Wix | Settings → Custom Code → Body (paid plan) |
| Shopify | Themes → theme.liquid before `</body>` |
| Squarespace | Settings → Code Injection → Footer |
| Webflow | Project Settings → Custom Code → Footer |
| React/Vue/Next.js | index.html or useEffect dynamic append |
