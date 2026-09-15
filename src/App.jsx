// RESTORE: use the existing stable App.jsx from the verified pre-finalization commit.
// Jobs and Invoices are intentionally routed by NavDrawer, which already provides
// the production workflow screens without changing the main application shell.
export { default } from "./App.stable";
