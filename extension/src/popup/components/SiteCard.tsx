import { h } from "preact";
import type { AliasRecord } from "../../lib/types.js";
import { getMessages } from "../i18n/index.js";

export interface SiteCardProps {
  alias: AliasRecord;
  lastReceivedAt?: number;
  onOpen: (alias: AliasRecord) => void;
  onDelete: (alias: AliasRecord) => void;
}

const t = getMessages();

function relative(ts?: number): string {
  if (!ts) return t.managed.noMail;
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / day)}일 전`;
}

function maskAddress(addr: string): string {
  // Show local prefix but mask middle for privacy in list view.
  const [local, domain] = addr.split("@");
  if (!local || !domain) return addr;
  const head = local.slice(0, 3);
  return `${head}•••@${domain}`;
}

export function SiteCard({ alias, lastReceivedAt, onOpen, onDelete }: SiteCardProps) {
  const name = alias.label ?? alias.origin ?? alias.address.split("@")[0];
  return (
    <div class="sm-site-card">
      <div class="favicon" aria-hidden="true">🛡</div>
      <button
        type="button"
        class="info"
        onClick={() => onOpen(alias)}
        style={{ background: "none", border: "none", textAlign: "left" }}
      >
        <strong>{name}</strong>
        <small>{maskAddress(alias.address)}</small>
        <small>
          {lastReceivedAt ? t.managed.lastMail(relative(lastReceivedAt)) : t.managed.noMail}
        </small>
      </button>
      <button
        type="button"
        class="sm-btn ghost"
        aria-label={t.managed.delete}
        onClick={() => onDelete(alias)}
      >
        ✕
      </button>
    </div>
  );
}
