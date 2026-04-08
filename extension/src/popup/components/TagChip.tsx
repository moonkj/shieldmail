import { h } from "preact";

export interface TagChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

export function TagChip({ label, selected, onClick }: TagChipProps) {
  return (
    <button
      type="button"
      class={`sm-tag-chip${selected ? " selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
