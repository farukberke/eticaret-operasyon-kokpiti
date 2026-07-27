import {
  AlertTriangle,
  LayoutDashboard,
  ListChecks,
  Package,
  PiggyBank,
  Sparkles,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Gezinme haritası — tek kaynak.
 *
 * Hem sidebar hem mobil menü hem de kokpitteki "detay" bağlantıları buradan
 * beslenir; bir sayfanın adresi değişirse tek satır değişir.
 */
export interface NavItem {
  readonly href:
    | "/"
    | "/priorities"
    | "/sales"
    | "/profit"
    | "/risks"
    | "/opportunities"
    | "/products"
    | "/costs";
  /** `nav.*` sözlük anahtarı. */
  readonly key: string;
  readonly icon: LucideIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", key: "cockpit", icon: LayoutDashboard },
  { href: "/priorities", key: "priorities", icon: ListChecks },
];

export const DETAIL_NAV: readonly NavItem[] = [
  { href: "/sales", key: "sales", icon: TrendingUp },
  { href: "/profit", key: "profit", icon: PiggyBank },
  { href: "/risks", key: "risks", icon: AlertTriangle },
  { href: "/opportunities", key: "opportunities", icon: Sparkles },
  { href: "/products", key: "products", icon: Package },
  { href: "/costs", key: "costs", icon: Wallet },
];
