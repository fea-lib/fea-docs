import {jsx} from "react/jsx-runtime";
import {useState, useEffect} from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return jsx("button", {
    onClick: () => setCount((c) => c + 1),
    children: `count: ${count}`,
  });
}

export function Effect() {
  const [state, setState] = useState("idle");
  useEffect(() => {
    setState("done");
  }, []);
  return jsx("output", {children: state});
}