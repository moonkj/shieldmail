import { h, render } from "preact";
import { App } from "./App.js";
import "./styles/popup.css";

// Liveness probe responder for background PING/PONG. Registered before render.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (
      msg &&
      typeof msg === "object" &&
      (msg as { type?: string }).type === "__SHIELDMAIL_PING__"
    ) {
      sendResponse({ type: "__SHIELDMAIL_PONG__" });
      return false;
    }
    return false;
  });
}

const root = document.getElementById("root");
if (root) {
  render(<App />, root);
}
