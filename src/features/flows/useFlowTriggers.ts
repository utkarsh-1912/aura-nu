import { useEffect, useMemo, useRef } from "react";
import { auth } from "../../firebase";
import { apiFetch } from "../../lib/apiClient";
import { MockAiClient } from "../../flow/mock";
import type { AiClient } from "../../flow/types";
import { createRealAiClient } from "./aiClient";
import { FlowLibrary } from "./flowLibrary";
import { createFlowRuntime } from "./services";
import { TriggerEngine } from "./triggers";
import { toNoteRef, StorageIdempotencyStore, type NoteLike } from "./workspaceApi";

/** Chosen per call: signed-in users get the real API, guests the labelled MOCK. */
export function lazyAiClient(): AiClient {
  const real = createRealAiClient({ fetchFn: apiFetch });
  const mock = new MockAiClient();
  const pick = () => (auth?.currentUser ? real : mock);
  return { complete: (r) => pick().complete(r), agentStep: (r) => pick().agentStep(r) };
}
export const isLiveAi = () => !!auth?.currentUser;

interface Options<N extends NoteLike> {
  userEmail: string;
  notes: N[];
  /** Same function the UI uses to change notes (e.g. handleUpdateNotesAndSync). */
  updateNotes: (next: N[]) => void;
  /** False until notes are hydrated for this user: avoids treating the initial load as "created". */
  enabled: boolean;
  workspaceId?: string;
}

/**
 * Runs enabled flows from note changes and schedules while the app is open.
 * One-line wiring in WorkspacePage:
 *   useFlowTriggers({ userEmail, notes, updateNotes: handleUpdateNotesAndSync, enabled: notesHydratedFor === userEmail });
 */
export function useFlowTriggers<N extends NoteLike>({ userEmail, notes, updateNotes, enabled, workspaceId }: Options<N>) {
  const notesRef = useRef(notes); notesRef.current = notes;
  const updRef = useRef(updateNotes); updRef.current = updateNotes;

  const rt = useMemo(() => {
    const library = new FlowLibrary(localStorage, userEmail);
    const engine: { current?: TriggerEngine } = {};
    const runtime = createFlowRuntime<N>({
      email: userEmail, storage: localStorage, library, ai: lazyAiClient(),
      binding: {
        workspaceId,
        getNotes: () => notesRef.current,
        updateNotes: (next) => { notesRef.current = next; updRef.current(next); },
        onWrite: (e) => { if (e.noteId && e.flowId) engine.current?.recordSelfWrite(e.flowId, e.noteId); },
      },
    });
    const eng = new TriggerEngine({
      startRun: async (flow, input, meta) => {
        await runtime.start(flow.graph, input, { startedBy: `trigger:${meta.trigger}` });
      },
    });
    engine.current = eng;
    return { library, engine: eng, runtime };
  }, [userEmail, workspaceId]);

  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      rt.library.reload();
      rt.engine.setKillSwitch(rt.library.isKilled());
      rt.engine.setFlows(rt.library.list().map((f) => ({ id: f.id, enabled: f.enabled, graph: f.graph })));
    };
    sync();
    const unsub = rt.library.subscribe(sync);
    const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("aura-flows-")) sync(); };
    window.addEventListener("storage", onStorage);
    void rt.runtime.recover().catch(() => undefined);
    return () => { unsub(); window.removeEventListener("storage", onStorage); rt.engine.dispose(); };
  }, [rt, enabled]);

  useEffect(() => {
    if (!enabled) return;
    rt.engine.ingestNotes(notes.filter((n) => !n.isTrashed).map(toNoteRef));
  }, [notes, enabled, rt]);

  return { library: rt.library };
}

export { StorageIdempotencyStore };
