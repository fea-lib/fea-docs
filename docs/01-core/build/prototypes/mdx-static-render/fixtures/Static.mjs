import {jsx} from "react/jsx-runtime";

export function Hello({name}) {
  return jsx("p", {children: `hallo ${name}`});
}

export function Timestamp() {
  return jsx("time", {children: new Date().toISOString()});
}