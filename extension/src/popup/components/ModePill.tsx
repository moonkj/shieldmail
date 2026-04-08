import { h } from "preact";
import type { UserMode } from "../../lib/types.js";

export interface ModePillProps {
  mode: UserMode;
  selected: boolean;
  label: string;
  description: string;
  onSelect: (mode: UserMode) => void;
}

export function ModePill({ mode, selected, label, description, onSelect }: ModePillProps) {
  return (
    <button
      type="button"
      class={`sm-mode-pill${selected ? " selected" : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(mode)}
    >
      <strong>{label}</strong>
      <span>{description}</span>
    </button>
  );
}
