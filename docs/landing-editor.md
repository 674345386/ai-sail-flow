# Landing page editor

Entry: `http://127.0.0.1:4317/?edit=landing`. The public landing also has an
“编辑落地页” button for authorized editors. This editor applies to `/`, including
the announcement, navigation, prompt, examples, use cases, content sections,
pricing, FAQ and footer. The separate `/agent` page is outside this scope.

## Manual workflow

1. Click an element to select it; drag to offset its position. Alt + click or
   the inspector's up arrow selects its parent container. The layer list reaches
   nested, hidden or obscured elements.
2. Drag a corner to resize, or set dimensions in the inspector. Aspect ratio
   locking and 8px snapping are available. Arrow keys move by 1px; Shift + arrow
   moves by 10px. Width/height reset buttons restore the original fluid layout.
3. Double click text to edit in place, or edit its text slots in the inspector.
   Text slots preserve child icons, spans and line breaks. Input placeholders
   have a dedicated field. Each language retains its own copy.
4. Change typography, colors, alignment, spacing, corner radius, rotation,
   opacity, layer order or visibility. Replace images, video sources, posters
   and background images by upload; media and link fields also accept safe URLs.
5. Desktop and mobile layout overrides are independent. The scope switch chooses
   which layout is edited. When editing a scope different from the current
   window, use Preview to inspect the result at that size. The preview iframe
   has a real viewport, including a 390px mobile view, and receives the unsaved
   draft through same-origin parent/iframe messaging.
6. “保存页面” publishes the edit document to this server. Leaving the editor
   displays the saved page and keeps the working draft for later. Undo/redo,
   local draft recovery, JSON backup import/export, per-element reset and
   restoring the original page are available. Restore is an undoable draft
   operation until explicitly saved.

Editing captures page navigation and form submission so selecting controls
does not start creative jobs. Selected tab buttons have an explicit “切换到此
标签内容” action in the inspector. Selected FAQ summaries can be expanded there.
Animations and video playback pause during editing. The inspector and layer
list remain available even if the page itself is hidden or moved.

## Persistence and access

- Document: `${SOP_DATA_DIR || data}/landing-editor/page.json`.
- Uploaded media: `landing-editor/assets/`, publicly served through UUID-only
  `/landing-assets/` paths. PNG/JPEG/WebP/GIF/AVIF images are limited to 10 MB;
  MP4/WebM videos to 100 MB. The server detects the actual file format.
- Writes are atomic, validate the shared Zod schema and require the current
  revision. Conflicting saves return 409 and preserve the local draft. Edits
  made while a save is in flight remain unsaved rather than being overwritten.
- Local mode inherits the server's loopback/host/origin checks. In public auth
  mode, writes additionally require a verified account listed in the comma
  separated `SOP_LANDING_EDITOR_USER_IDS`. Public page reads do not require login.
- Local recovery key: `sail-landing-page-draft-v1`. The server is the authority
  for saved public changes. Local background/announcement settings remain their
  existing features; editor overrides can adjust the rendered elements.

## Implementation boundaries

`shared/landing-editor.ts` defines the whitelist of editable properties and safe
URLs. Arbitrary CSS, JavaScript and HTML are not accepted. `src/landing-editor/dom.ts`
assigns stable identities from structural paths, ignoring copy and transient
classes. Repeating marquee copies share identities; interactive scene/team states
have separate identities. It updates existing text nodes and whitelisted
attributes rather than replacing React-managed child markup. Layout rules are
scoped to tagged landing nodes and viewport media queries. Original values are
restored when an override is removed or the runtime is disposed.

The editor is an Operate surface using the existing local UI font, dark panels,
compact controls and pale green actions. Its tokens are scoped to `.lpe-ui`;
the marketing design system and original page source content remain intact.

## Bounded verification

- `npm run check`.
- `node --import tsx scripts/landing-editor-check.ts` verifies API persistence,
  restart/readback, conflicts, access, validated uploads, responsive styles and
  reset using a temporary store and ephemeral HTTP server.
- Optional DOM checks use an isolated LinkeDOM installation, without adding a
  project dependency: add `--dom=/absolute/path/to/linkedom/esm/index.js` to the
  same command. They verify stable selection identities, preserved child nodes,
  literal text safety, mirrored content, locale/scene isolation and restoration.
- The mechanical design detector ran once; there were no non-advisory findings.
- The live dev server served the entry, modules and API routes successfully.
  No browser or computer automation was used; visual rendering, pointer geometry
  and iframe behavior await manual inspection in the running page.
