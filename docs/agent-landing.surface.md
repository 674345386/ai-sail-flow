# Agent landing

Route: `/agent`. Mode: Persuade. The existing `/` Studio landing remains available.

The reference is the user-supplied CapyAI home screenshot and its public HTML,
stylesheet, desktop home chunk, and mobile home chunk. These were downloaded
without browser automation. REA inspected the inert JavaScript; analysis of the
main bundle reached its resource bound, so the retained graph is partial.
Source URLs, hashes, and the exact Evidence IDs are in
`work/capyai-reference/manifest.json` and `rea-evidence.json`. No live interaction
with the reference site was observed.

The new surface uses the existing AI-Sail Flow mark and local Anthropic Sans /
Serif fonts. A white canvas, charcoal controls, and a restrained lime accent
follow the requested reference. The first screen leads with a model strip,
headline, working idea composer, and a horizontal inspiration gallery. Existing
public marketing assets provide the gallery; private workspace media and the
reference site's images are not republished.

The composer creates a fresh Agent creative and carries its text into the chat
draft. It retains pending text through sign-in, and clearing the sign-in dialog
cancels the pending entry. It does not automatically send the draft or generate
paid media. Gallery choices and the example button populate the composer.
Images in the feature preview are explicitly illustrative. No sales, usage,
pricing, or customer claims are copied from the reference.

Checks are limited to type checking, asset existence, syntax, production build,
and a local route read. Browser visual verification requires the user's consent
under this workspace's instructions and is not part of this delivery.
