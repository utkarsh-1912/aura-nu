import React from "react";
import { Archive } from "lucide-react";
import { EmptyState } from "../../ui";

export default function ArchiveView() {
  return (
    <div className="flex h-full flex-grow select-none items-center justify-center bg-surface text-fg">
      <EmptyState
        icon={<Archive size={18} />}
        title="Archive"
        description="Select an archived note to read it or restore it to your workspace."
      />
    </div>
  );
}
