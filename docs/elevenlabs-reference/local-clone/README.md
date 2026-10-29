# Offline templates-page recreation

The downloaded `/app/agents/templates` response is an authenticated Next.js app shell with an empty hidden root, not a complete static page. The original route's downloaded JavaScript bundle contains the templates layout and component structure, but the actual template records come from the signed-in API.

This local recreation follows that structure: the app shell, left template library, search and filters, selectable cards, preview/workflow canvas, and detail panel. The visual tokens and Inter font are loaded from the captured local ElevenLabs stylesheets and fonts. The displayed template records are illustrative local data; account actions and voice conversations remain inactive.

Run `python3 docs/elevenlabs-reference/serve_local.py` from the repository root and open <http://127.0.0.1:4178/app/agents/templates?trigger=wizard>. All rendered assets and page behavior are served locally; the server's CSP blocks external connections.
