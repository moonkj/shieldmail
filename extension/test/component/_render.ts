/**
 * Minimal Preact render helper (no @testing-library/preact dependency).
 */
import { h, render, type ComponentType } from "preact";
import { afterEach } from "vitest";

const roots: HTMLElement[] = [];

export function renderComponent<P>(
  Component: ComponentType<P>,
  props: P
): { container: HTMLElement; unmount: () => void; rerender: (next: P) => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  roots.push(container);
  render(h(Component as ComponentType<unknown>, props as unknown as {}), container);
  return {
    container,
    unmount: () => {
      render(null, container);
      container.remove();
    },
    rerender: (next: P) => {
      render(h(Component as ComponentType<unknown>, next as unknown as {}), container);
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
