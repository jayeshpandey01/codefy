// vitest + @testing-library/react jsdom setup.

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react doesn't auto-cleanup after each test unless this is
// wired up explicitly for the current test runner -- without it, multiple
// render() calls across tests in the same file pile up in the same jsdom
// document.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement ResizeObserver, which @xyflow/react relies on
// internally. A minimal stub is enough for the tests in this package (none
// of them assert on measured element sizes).
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}
