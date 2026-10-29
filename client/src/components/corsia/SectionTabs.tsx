import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { normalizePath, type SectionTab } from "@/lib/navigation";

/** Sub-sections of a hub (Allena, Community): links with an underline on the active one. */
export function SectionTabs({
  tabs,
  ariaLabel,
}: {
  tabs: readonly SectionTab[];
  ariaLabel: string;
}) {
  const [location] = useLocation();
  const path = normalizePath(location);
  return (
    <nav
      aria-label={ariaLabel}
      className="-mx-4 mb-4 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0"
    >
      <ul className="flex min-w-max gap-6">
        {tabs.map(tab => {
          const active = tab.match(path);
          return (
            <li key={tab.path}>
              <Link
                href={tab.path}
                aria-current={active ? "page" : undefined}
                data-tour={tab.dataTour}
                className={cn(
                  "relative inline-flex h-12 items-center text-[15px] font-semibold transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
