import {jsx} from "react/jsx-runtime";
import {useState, useEffect} from "react";

// renderMode="hybrid" comes through as a real prop (MDX JSX attr). When set,
// the component emits a `data-hydrate` mount marker on its root so a hydration
// script can find and re-render it in place. This is the Z3 marker contract.
export function Counter({renderMode}) {
  const [count, setCount] = useState(0);
  return jsx(
    "button",
    renderMode === "hybrid"
      ? {["data-hydrate"]: "Counter", onClick: () => setCount((c) => c + 1), children: `count: ${count}`}
      : {onClick: () => setCount((c) => c + 1), children: `count: ${count}`}
  );
}

export function Effect({renderMode}) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    setTimeout(() => setState("done"), 1000);
  }, []);
  return jsx(
    "output",
    renderMode === "hybrid"
      ? {["data-hydrate"]: "Effect", children: state}
      : {children: state}
  );
}