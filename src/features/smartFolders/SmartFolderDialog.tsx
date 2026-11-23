/** Create / edit a smart folder rule. Flat "match ALL/ANY" builder, plus a JSON tab for advanced (nested) rules. */
import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Dialog, Field, IconButton, Input, Segmented, Select, Textarea } from "../../ui";
import { PRESET_RULES, validateRule, type Rule } from "../../core/smartFolders";
import type { Folder } from "../../types";
import { FIELDS, blankCond, fieldDef, formToRule, ruleToForm, type RuleForm } from "./form";
import type { SmartFolder } from "./store";

interface Props {
  open: boolean;
  initial: SmartFolder | null;
  folders: Folder[];
  onClose: () => void;
  onSave: (sf: SmartFolder) => void;
  onDelete?: (id: string) => void;
}

const newId = () => `sf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function SmartFolderDialog({ open, initial, folders, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState("");
  const [form, setForm] = useState<RuleForm>({ match: "and", conds: [blankCond()] });
  const [tab, setTab] = useState<"builder" | "json">("builder");
  const [json, setJson] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setName(initial?.name ?? "");
    const f = initial ? ruleToForm(initial.rule) : { match: "and" as const, conds: [blankCond()] };
    if (f) { setForm(f); setTab("builder"); } else { setTab("json"); }
    setJson(initial ? JSON.stringify(initial.rule, null, 2) : "");
  }, [open, initial]);

  const save = () => {
    const nm = name.trim();
    if (!nm) { setError("Give the smart folder a name."); return; }
    let rule: Rule;
    if (tab === "builder") {
      const r = formToRule(form);
      if (!r.ok) { setError((r as { error: string }).error); return; }
      rule = r.rule;
    } else {
      let parsed: unknown;
      try { parsed = JSON.parse(json); } catch { setError("The rule is not valid JSON."); return; }
      const v = validateRule(parsed);
      if (!v.ok) { setError((v as { error: string }).error); return; }
      rule = v.rule;
    }
    onSave({ id: initial?.id ?? newId(), name: nm, rule });
    onClose();
  };

  const setCond = (i: number, patch: Partial<RuleForm["conds"][number]>) =>
    setForm((f) => ({ ...f, conds: f.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? "Edit smart folder" : "New smart folder"}
      description="A smart folder shows every note that matches its rule. Notes are never moved."
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {initial && onDelete ? (
            <Button variant="danger" onClick={() => { onDelete(initial.id); onClose(); }}>Delete folder</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Open tasks this week" maxLength={80} />}</Field>

        <Segmented
          value={tab}
          onChange={(v) => {
            if (v === "json" && tab === "builder") { const r = formToRule(form); if (r.ok) setJson(JSON.stringify(r.rule, null, 2)); }
            if (v === "builder" && tab === "json") {
              try {
                const v2 = validateRule(JSON.parse(json));
                const f = v2.ok ? ruleToForm(v2.rule) : null;
                if (!f) { setError("This rule uses nested groups or NOT, so it can only be edited as JSON."); return; }
                setForm(f);
              } catch { setError("Fix the JSON before switching tabs."); return; }
            }
            setError("");
            setTab(v);
          }}
          size="sm"
          items={[{ id: "builder", label: "Builder" }, { id: "json", label: "Advanced (JSON)" }]}
        />

        {tab === "builder" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
              <span>Match</span>
              <Select aria-label="Match mode" className="!w-28" value={form.match} onChange={(e) => setForm({ ...form, match: e.target.value as "and" | "or" })}>
                <option value="and">all</option>
                <option value="or">any</option>
              </Select>
              <span>of these conditions</span>
            </div>
            {form.conds.map((c, i) => {
              const def = fieldDef(c.field)!;
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
                  <Select aria-label="Field" className="!w-40" value={c.field} onChange={(e) => {
                    const d = fieldDef(e.target.value)!;
                    setCond(i, { field: d.id, op: d.ops[0].id, value: d.kind === "bool" ? "true" : "" });
                  }}>
                    {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </Select>
                  <Select aria-label="Operator" className="!w-44" value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>
                    {def.ops.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select>
                  {def.kind === "bool" ? (
                    <Select aria-label="Value" className="!w-24" value={c.value || "true"} onChange={(e) => setCond(i, { value: e.target.value })}>
                      <option value="true">yes</option>
                      <option value="false">no</option>
                    </Select>
                  ) : def.kind === "folder" ? (
                    <Select aria-label="Folder" className="!w-44" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}>
                      <option value="">Choose a folder</option>
                      {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </Select>
                  ) : (
                    <Input
                      aria-label="Value"
                      className="min-w-0 flex-1"
                      type={def.kind === "number" || (def.kind === "days" && c.op === "withinDays") ? "number" : def.kind === "days" ? "date" : "text"}
                      value={c.value}
                      placeholder={def.kind === "tags" ? "tag1, tag2" : ""}
                      onChange={(e) => setCond(i, { value: e.target.value })}
                    />
                  )}
                  <IconButton label="Remove condition" size="sm" disabled={form.conds.length === 1} onClick={() => setForm({ ...form, conds: form.conds.filter((_, j) => j !== i) })}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" leadingIcon={<Plus size={13} />} onClick={() => setForm({ ...form, conds: [...form.conds, blankCond()] })}>Add condition</Button>
              <span className="text-[12px] text-fg-subtle">Presets:</span>
              {Object.entries(PRESET_RULES).map(([label, rule]) => (
                <Button key={label} size="sm" variant="ghost" onClick={() => {
                  const f = ruleToForm(rule);
                  if (f) setForm(f);
                  if (!name.trim()) setName(label);
                }}>{label}</Button>
              ))}
            </div>
          </div>
        ) : (
          <Field label="Rule (JSON)" hint="Groups: { type: 'group', op: 'and' | 'or', not?: boolean, rules: [...] }. Conditions: { type: 'cond', field, op, value }.">
            {(p) => <Textarea {...p} rows={10} className="font-mono text-[12px]" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />}
          </Field>
        )}

        {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
