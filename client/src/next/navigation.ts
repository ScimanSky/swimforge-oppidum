import { useLocation } from "wouter";

export function usePathname() {
  const [location] = useLocation();
  return location;
}
