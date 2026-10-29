# ElevenLabs app reference

Captured from https://elevenlabs.io/app/agents/templates?trigger=wizard on 2026-10-28. `index.html` and `app_assets/` retain the public response and its CSS, JavaScript, fonts, and media. `public_app_assets/` contains public fonts, icons, and the manifest. The original response is an authenticated Next.js shell with an empty root; the template records load from a signed-in API and are not embedded in the capture.

`local-clone/` is an offline recreation of the templates page, based on the downloaded page bundle's actual layout and controls. It loads the captured local ElevenLabs styles and fonts, and uses sample template data because the original account API data was not part of the public response. Search, filters, card selection, preview/workflow tabs, and details work locally; account and conversation actions are illustrative.

## Local preview

Run `python3 docs/elevenlabs-reference/serve_local.py` from the repository root, then open <http://127.0.0.1:4178/app/agents/templates?trigger=wizard>. The server binds to localhost, serves the recreation for all `/app/*` paths, and sends a Content Security Policy that blocks external connections.
