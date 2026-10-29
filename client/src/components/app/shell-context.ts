import { createContext, useContext } from "react";

/** True under the persistent AppShell: pages must not render a second shell. */
export const ShellContext = createContext(false);

export const useInShell = () => useContext(ShellContext);
