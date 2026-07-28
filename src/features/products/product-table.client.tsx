"use client";

import {
  Boxes,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  PackageX,
  TrendingDown,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { StockCoverageState } from "@/core/services/stock-forecast";
import { Badge } from "@/ui/primitives/badge";
import { DataTable, type Column } from "@/ui/patterns/data-table";
import { EmptyState } from "@/ui/patterns/empty-state";

import { productAnchorId } from "./product-focus";
import type { ProductRow, ProductTableLabels } from "./product-row";

/**
 * Durum → ikon.
 *
 * İkon seçimi burada, çünkü React bileşeni sunucu→istemci sınırını geçemez;
 * sunucudan yalnızca `state` metni geliyor.
 *
 * Her durumun kendi ikonu var ve hiçbiri yalnızca renkle ayrışmıyor: üçgen
 * uyarı, düşen ok, onay, kutular, soru, çizgi ve kırık paket birbirinden
 * biçimce de ayırt edilebilir.
 */
const COVERAGE_ICON: Record<StockCoverageState, LucideIcon> = {
  critical: TriangleAlert,
  low: TrendingDown,
  normal: CircleCheck,
  high: Boxes,
  unknown: CircleHelp,
  noSales: CircleMinus,
  negative: PackageX,
};

/**
 * "Kalan gün" hücresi.
 *
 * İki katman: üstte tahmini gün sayısı (sıralanan sayı), altında durumu
 * söyleyen ikonlu rozet. Ölçülemeyen ürünlerde sayı satırı hiç yok — "—"
 * basıp altına "Satış verisi yok" yazmak aynı şeyi iki kez söylemek olurdu.
 *
 * `title` tahminin dayanağını taşır: kullanıcı 2,5 günün nereden geldiğini
 * tablodan ayrılmadan görebilmeli.
 */
function CoverageCell({ row }: { row: ProductRow }) {
  const { coverage } = row;
  const Icon = COVERAGE_ICON[coverage.state];

  return (
    <div className="flex flex-col items-end gap-1" title={coverage.hint}>
      {coverage.daysLabel && <span className="tabular">{coverage.daysLabel}</span>}
      <Badge tone={coverage.tone}>
        <Icon className="size-3 shrink-0" aria-hidden />
        {coverage.stateLabel}
      </Badge>
    </div>
  );
}

/**
 * Ürün tablosunun istemci yarısı.
 *
 * Kolon tanımları `render` ve `sortValue` fonksiyonları içerdiği için burada
 * kurulur: fonksiyonlar sunucu→istemci sınırını geçemez. Sunucudan yalnızca
 * satırlar (düz veri) ve etiketler (düz metin) gelir.
 *
 * `compact` kokpitteki dar görünüm içindir; tam tablo `/products` sayfasında.
 */
export function ProductTableClient({
  rows,
  labels,
  compact = false,
  focusProductId,
}: {
  rows: readonly ProductRow[];
  labels: ProductTableLabels;
  compact?: boolean;
  /**
   * Kokpitteki stok uyarısından "Ürüne git" ile gelindiğinde vurgulanacak
   * satır. Adres çubuğunda durur — bağlantı paylaşılabilir, yenilenince
   * kaybolmaz.
   */
  focusProductId?: string | undefined;
}) {
  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: labels.name,
      render: (row) => row.name,
      sortValue: (row) => row.name,
      cellClassName: "font-medium",
    },
    ...(compact
      ? []
      : [
          {
            key: "category",
            header: labels.category,
            render: (row: ProductRow) => row.category,
            sortValue: (row: ProductRow) => row.category,
            cellClassName: "text-fg-muted",
          },
        ]),
    {
      /**
       * Maliyet sütunu adı ürünün hemen yanında: maliyeti eksik bir ürünün
       * kâr sütununda "—" görmek, sebebini de aynı satırda görmeden anlamsız.
       */
      key: "unitCost",
      header: labels.unitCost,
      render: (row) =>
        row.costStatus === "missing" ? (
          <Badge tone="warning">{labels.costMissing}</Badge>
        ) : (
          row.unitCostLabel
        ),
      // Eksik olanlar sıralamada bir arada dursun.
      sortValue: (row) => (row.costStatus === "missing" ? 0 : 1),
      numeric: true,
    },
    {
      key: "unitsSold",
      header: labels.unitsSold,
      render: (row) => row.unitsSoldLabel,
      sortValue: (row) => row.unitsSold,
      numeric: true,
    },
    {
      key: "netRevenue",
      header: labels.netRevenue,
      render: (row) => row.netRevenueLabel,
      sortValue: (row) => row.netRevenueMinor,
      numeric: true,
    },
    {
      key: "netProfit",
      header: labels.netProfit,
      render: (row) => row.netProfitLabel,
      sortValue: (row) => row.netProfitMinor,
      numeric: true,
    },
    {
      key: "margin",
      header: labels.margin,
      render: (row) => row.marginLabel,
      sortValue: (row) => row.marginRatio,
      numeric: true,
    },
    ...(compact
      ? []
      : [
          {
            key: "returnRate",
            header: labels.returnRate,
            render: (row: ProductRow) => row.returnRateLabel,
            sortValue: (row: ProductRow) => row.returnRate,
            numeric: true,
          },
          {
            key: "stock",
            header: labels.stock,
            render: (row: ProductRow) => row.stockLabel,
            sortValue: (row: ProductRow) => row.stock,
            numeric: true,
          },
        ]),
    {
      key: "daysOfCover",
      header: labels.daysOfCover,
      render: (row) => <CoverageCell row={row} />,
      /**
       * Sıralama ham gün sayısıyla: en az kalan gün ilk tıklamada başa gelir.
       * Ölçülemeyenler `null` olduğu için tablonun sonuna düşer — "bilinmiyor"
       * ne en iyi ne en kötü değerdir.
       */
      sortValue: (row) => row.daysOfCover,
      numeric: true,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        getRowAnchor={(row) => productAnchorId(row.id)}
        isRowHighlighted={(row) => row.id === focusProductId}
        initialSort={{ key: "netRevenue", direction: "desc" }}
        sortHint={labels.sortHint}
        emptyState={
          <EmptyState title={labels.empty} description={labels.emptyDescription} />
        }
      />
      {/*
        Tahminin dayanağı tablonun altında bir kez yazılı. Rozet "Kritik"
        diyorsa kullanıcı bunun hangi döneme göre söylendiğini bilmeden karar
        veremez — 7 günlük hıza göre kritik olan ürün 90 günlük hıza göre
        normal olabilir.
      */}
      {rows.length > 0 && (
        <p className="text-fg-subtle px-4 pb-2 text-xs">{labels.coverageNote}</p>
      )}
    </div>
  );
}
