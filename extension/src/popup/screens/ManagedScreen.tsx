import { h, Fragment } from "preact";
import { useMemo, useState } from "preact/hooks";
import { SiteCard } from "../components/SiteCard.js";
import { TagChip } from "../components/TagChip.js";
import { PrivacyFooter } from "../components/PrivacyFooter.js";
import { getMessages } from "../i18n/index.js";
import { useManagedAliases } from "../state/store.js";
import { sendRuntime } from "../../lib/messaging.js";
import type { AliasRecord } from "../../lib/types.js";
import type { Screen } from "../App.js";

export interface ManagedScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

const ALL_TAGS: Array<keyof typeof t.managed.tags> = [
  "all",
  "work",
  "shopping",
  "qa",
  "newsletter",
];

const TAG_KEY_TO_VALUE: Record<string, string> = {
  work: "업무",
  shopping: "쇼핑",
  qa: "QA테스트",
  newsletter: "뉴스레터",
};

export function ManagedScreen({ navigate }: ManagedScreenProps) {
  const aliases = useManagedAliases();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<keyof typeof t.managed.tags>("all");
  const [detail, setDetail] = useState<AliasRecord | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return aliases.filter((a) => {
      if (tag !== "all") {
        const tagValue = TAG_KEY_TO_VALUE[tag];
        if (!tagValue || !(a.tags ?? []).includes(tagValue)) return false;
      }
      if (q) {
        const hay = `${a.label ?? ""} ${a.origin ?? ""} ${a.address}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [aliases, query, tag]);

  const handleDelete = async (alias: AliasRecord): Promise<void> => {
    await sendRuntime({ type: "DELETE_ALIAS", aliasId: alias.aliasId });
  };

  return (
    <div class="sm-app">
      <header class="sm-header">
        <h1>
          <button
            type="button"
            class="icon-btn"
            aria-label={t.header.back}
            onClick={() => navigate("main")}
          >
            ←
          </button>
          {t.managed.title}
        </h1>
      </header>
      <div class="sm-body">
        <input
          type="search"
          class="sm-search"
          placeholder={t.managed.searchPlaceholder}
          value={query}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
        <div class="sm-tag-chips">
          {ALL_TAGS.map((k) => (
            <TagChip
              key={k}
              label={t.managed.tags[k]}
              selected={tag === k}
              onClick={() => setTag(k)}
            />
          ))}
          <TagChip label={t.managed.tags.addTag} selected={false} onClick={() => {}} />
        </div>
        {filtered.length === 0 ? (
          <p class="sm-empty">{t.managed.empty}</p>
        ) : (
          <div>
            {filtered.map((a) => (
              <SiteCard
                key={a.aliasId}
                alias={a}
                onOpen={setDetail}
                onDelete={(al) => void handleDelete(al)}
              />
            ))}
          </div>
        )}
        {detail ? (
          <div
            role="dialog"
            aria-modal="true"
            class="sm-error-card"
            style={{ borderLeftColor: "var(--sm-primary)" }}
          >
            <h3>{detail.label ?? detail.origin ?? detail.aliasId}</h3>
            <p style={{ fontFamily: "var(--sm-font-mono)" }}>{detail.address}</p>
            <p>
              <small>{t.managed.detailNote}</small>
            </p>
            <button class="sm-btn secondary" type="button" onClick={() => setDetail(null)}>
              {t.header.back}
            </button>
          </div>
        ) : null}
      </div>
      <PrivacyFooter />
    </div>
  );
}
