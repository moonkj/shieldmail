/**
 * Minimal Preact render helper (no @testing-library/preact dependency).
 */
import { h, render } from "preact";
import { afterEach } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = (props: any) => any;

const roots: HTMLElement[] = [];

export function renderComponent(
  Component: AnyComponent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any> = {},
): { container: HTMLElement; unmount: () => void; rerender: (next: Record<string, unknown>) => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  roots.push(container);
  render(h(Component, props), container);
  return {
    container,
    unmount: () => {
      render(null, container);
      container.remove();
    },
    rerender: (next) => {
      render(h(Component, next), container);
    },
  };
}

afterEach(() => {
  while (roots.length) {
    const c = roots.pop()!;
    render(null, c);
    c.remove();
  }
});

export function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
