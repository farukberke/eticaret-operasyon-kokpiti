"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

import { DETAIL_NAV, PRIMARY_NAV, type NavItem } from "./nav-items";

/**
 * Sol menü.
 *
 * İstemci bileşeni olmasının tek sebebi aktif yolu bilmek (`usePathname`).
 * Aktif durum `aria-current="page"` ile de bildirilir — renk ve arkaplan
 * ekran okuyucuya hiçbir şey söylemez.
 */
function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const t = useTranslations("nav");
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent-soft text-accent font-medium"
          : "text-fg-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {t(item.key)}
    </Link>
  );
}

export function SidebarNav({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const groups = [
    { label: t("sectionMain"), items: PRIMARY_NAV },
    { label: t("sectionDetail"), items: DETAIL_NAV },
  ];

  return (
    <nav className={cn("flex flex-col gap-5", className)}>
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="text-fg-subtle px-2.5 text-[11px] font-medium tracking-wide uppercase">
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </div>
      ))}
    </nav>
  );
}
