
## notes-list / editor chrome agent
- Promote a `ListRow` primitive (title/preview/meta/selected bar) to src/ui; NotesList builds its own.
- `Checkbox` in src/ui requires a visible label; NotesList uses a native checkbox with aria-label. A label-less variant would help.
- `Menu` has no checked/selected state; sort menu shows "(current)" in the label.
- EditorArea has no Edit/Split/Preview switch (it is a unified live-doc editor; viewMode is a constant), so no Segmented mode switch was added.
