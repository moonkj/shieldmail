/**
 * Shared DOM helpers for detect unit tests.
 *
 * happy-dom returns zero-sized bounding rects for elements, which makes
 * `isVisible()` always false. We monkey-patch getBoundingClientRect on the
 * HTMLElement prototype to return a nonzero rect for unit tests.
 */
import { beforeAll } from "vitest";

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
});

export function mountHTML(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

export function setLocation(pathname: string, search = ""): void {
  // happy-dom 14: history.replaceState doesn't always update window.location
  // synchronously. Use href assignment which is more reliably propagated.
  try {
    window.history.replaceState({}, "", pathname + search);
  } catch {
    // ignore
  }
  // Double-write via location.href as a backup. happy-dom may navigate, so
  // wrap in try/catch to suppress NavigationError in test runs.
  try {
    (window as unknown as { location: { href: string } }).location.href =
      "http://localhost" + pathname + search;
  } catch {
    // ignore
  }
}

export function setTitle(title: string): void {
  document.title = title;
}

export function ctx(form: HTMLElement) {
  return { doc: document, location: window.location, form };
}
