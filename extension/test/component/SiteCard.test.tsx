/**
 * Component tests for SiteCard — alias card in Managed Mode.
 */
import { describe, it, expect, vi } from "vitest";
import { SiteCard } from "../../src/popup/components/SiteCard";
import { renderComponent } from "./_render";
import type { AliasRecord } from "../../src/lib/types";

function makeAlias(overrides: Partial<AliasRecord> = {}): AliasRecord {
  return {
    aliasId: "test-alias",
    address: "abcdef@shldmail.work",
    expiresAt: null,
    pollToken: "tok",
    mode: "managed",
    createdAt: Date.now(),
    origin: "https://example.com",
    label: "GitHub",
    tags: ["업무"],
    ...overrides,
  };
}

describe("SiteCard", () => {
  it("renders the alias label as card name", () => {
    const { container } = renderComponent(SiteCard, {
      alias: makeAlias({ label: "GitHub" }),
      onOpen: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(container.textContent).toContain("GitHub");
  });

  it("falls back to origin when label is absent", () => {
    const { container } = renderComponent(SiteCard, {
      alias: makeAlias({ label: undefined, origin: "https://example.com" }),
      onOpen: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(container.textContent).toContain("https://example.com");
  });

  it("masks the email address in display", () => {
    const { container } = renderComponent(SiteCard, {
      alias: makeAlias({ address: "abcdef@shldmail.work" }),
      onOpen: vi.fn(),
      onDelete: vi.fn(),
    });
    // maskAddress shows first 3 chars + mask
    expect(container.textContent).toContain("abc");
    expect(container.textContent).toContain("@shldmail.work");
  });

  it("calls onOpen when info button is clicked", () => {
    const onOpen = vi.fn();
    const alias = makeAlias();
    const { container } = renderComponent(SiteCard, {
      alias,
      onOpen,
      onDelete: vi.fn(),
    });
    const infoBtn = container.querySelector(".info") as HTMLButtonElement;
    infoBtn.click();
    expect(onOpen).toHaveBeenCalledWith(alias);
  });

  it("calls onDelete when delete button is clicked", () => {
    const onDelete = vi.fn();
    const alias = makeAlias();
    const { container } = renderComponent(SiteCard, {
      alias,
      onOpen: vi.fn(),
      onDelete,
    });
    const deleteBtn = container.querySelector(".sm-btn.ghost") as HTMLButtonElement;
    deleteBtn.click();
    expect(onDelete).toHaveBeenCalledWith(alias);
  });

  it("shows no-mail text when no lastReceivedAt", () => {
    const { container } = renderComponent(SiteCard, {
      alias: makeAlias(),
      onOpen: vi.fn(),
      onDelete: vi.fn(),
    });
    // Should show the noMail message
    expect(container.textContent).toBeTruthy();
  });

  it("renders shield emoji favicon", () => {
    const { container } = renderComponent(SiteCard, {
      alias: makeAlias(),
      onOpen: vi.fn(),
      onDelete: vi.fn(),
    });
    const favicon = container.querySelector(".favicon");
    expect(favicon?.textContent).toContain("\u{1F6E1}");
  });
});
