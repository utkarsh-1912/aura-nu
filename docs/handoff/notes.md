# Handoff: Notes area (Phase 2 - editor and Apple-Notes parity)

All new, nothing wired into the app. Tests: `npx vitest run tests/notes` (61 passing).

## Files
- `src/core/markdown.ts` - Markdown <-> HTML (marked + turndown), string-based `sanitizeHtml`, frontmatter, `stripMarkdown`, `extractHashtags`.
- `src/core/links.ts` - wikilink parse, `LinkIndex` (backlinks, unresolved, unlinked mentions, orphans, edges, rename-safe rewrite).
- `src/core/search.ts` - `SearchIndex` (BM25, prefix, typo-tolerant, filters, snippets, suggest).
- `src/core/smartFolders.ts` - JSON rule engine (AND/OR/NOT groups), validation, presets.
- `src/core/vaultCrypto.ts` - `lockText` / `unlockText` / `changePassword` (AES-GCM + PBKDF2-SHA256, 600k iters).
- `src/editor/AuraEditor.tsx` - TipTap v3 component (props: value, onChange, readOnly, onWikiLinkClick, onWikiSuggest; ref: insertWikiLink).
- `src/import/*` - `importMarkdownFiles`, `importNotionZip`, `importEnex`, `importAppleNotesFiles` (all return `ImportedNote[]`).

## Wiring needed from the lead
1. Behind a flag, render `<AuraEditor value={note.content} onChange={...} />` in place of the legacy editor. Editor CSS (prose, task-list checkboxes, tables) is NOT provided; add styles in a shared stylesheet. Wire `onWikiLinkClick` to note lookup via `LinkIndex.resolve(title)` and `onWikiSuggest` to a popup (use `SearchIndex.search` / title list), then `ref.insertWikiLink(range, title)`.
2. Build `LinkIndex` / `SearchIndex` once from notes at load and call `upsert`/`remove` on each note change; use `LinkIndex.rename()` output to persist link rewrites in other notes.
3. Locked notes: store `lockText(content, pw)` output in `content`, keep `isLocked`; do not index or send locked content to AI/search. Title/folder stay plaintext.
4. Importers: a UI reads files (`File.text()`, `arrayBuffer()` for zip/enex) and passes them in; map `ImportedNote` to `Note` (folderPath -> folder joined by "/"; recompute wordCount).
5. Optional dependency: `turndown-plugin-gfm` was not installed, so tables/tasks/strikethrough are handled by custom turndown rules. No new dependency is required.

## Not done / honest limits
- `AuraEditor.tsx` has never been rendered or type-checked in a browser/jsdom by me; no component tests. Attachments/image upload UI, slash menu, drawing, scanning, audio, Yjs collaboration binding are NOT built.
- Markdown round trip: tables lose column alignment and merged cells; raw HTML blocks are sanitised, not preserved; no footnotes/math.
- Search is lexical only (no stemming, no CJK segmentation, no phrase queries). Perf test (5k notes) prints real timings; on this shared Windows machine indexing took ~12s (slow: ~2ms/note), queries ~60ms. Thresholds in the test are deliberately loose; indexing speed should be improved (e.g. in a worker, or tokeniser optimisation) before relying on it for 5k+ notes on the main thread.
- vaultCrypto is unaudited; no recovery; metadata and length are not hidden; rollback to an older envelope is not detected. Wrong-password vs tamper of the `check` field are indistinguishable.
- Apple Notes: Apple has no official export format. Supported routes only: HTML folder exports and Markdown folder exports from third-party exporters, plus plain .txt. The NoteStore.sqlite database, locked notes, scans/drawings and attachments are NOT supported.
- Notion: CSV databases are listed as attachments only; page properties are kept as text (tags/dates mined). Evernote: attachment bytes are not imported (metadata only), encrypted text is omitted, notebook names are absent from .enex.
- Zip safety: entry count, per-entry and total inflated bytes are capped and enforced while streaming; the library cannot detect a bomb in entries we deliberately do not inflate (they are only listed).
