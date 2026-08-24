import {jsx} from "react/jsx-runtime";
import {hydrateRoot} from "react-dom/client";
import {Counter, Effect} from "./Hybrid.mjs";

const REGISTRY = {Counter, Effect};

for (const el of document.querySelectorAll("[data-hydrate]")) {
  const name = el.dataset.hydrate;
  const Comp = REGISTRY[name];
  if (!Comp) continue;
  
  // Real React hydration: hydrateRoot takes the server-rendered DOM node
  // and attaches event listeners + runs effects.
  hydrateRoot(el, jsx(Comp, {renderMode: "hybrid"}));
  el.setAttribute("data-hydrated", name);
}
