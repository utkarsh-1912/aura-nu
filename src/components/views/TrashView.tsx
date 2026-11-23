import React from "react";
import { Trash2 } from "lucide-react";
import { Button, EmptyState } from "../../ui";

interface TrashViewProps {
  hasNotes: boolean;
  onEmptyTrash: () => void;
}

export default function TrashView({ hasNotes, onEmptyTrash }: TrashViewProps) {
  return (
    <div className="flex h-full flex-grow select-none items-center justify-center bg-surface text-fg">
      <EmptyState
        icon={<Trash2 size={18} />}
        title="Trash"
        description="Select a trashed note to read it or restore it. Items stay here until the trash is emptied."
        action={
          hasNotes ? (
            <Button variant="danger" size="md" onClick={onEmptyTrash}>
              Empty trash
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
