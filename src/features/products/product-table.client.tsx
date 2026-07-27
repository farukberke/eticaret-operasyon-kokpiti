"use client";

import { DataTable, type Column } from "@/ui/patterns/data-table";
import { EmptyState } from "@/ui/patterns/empty-state";

import type { ProductRow, ProductTableLabels } from "./product-row";

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
}: {
  rows: readonly ProductRow[];
  labels: ProductTableLabels;
  compact?: boolean;
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
      render: (row) => row.daysOfCoverLabel,
      sortValue: (row) => row.daysOfCover,
      numeric: true,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      initialSort={{ key: "netRevenue", direction: "desc" }}
      sortHint={labels.sortHint}
      emptyState={
        <EmptyState title={labels.empty} description={labels.emptyDescription} />
      }
    />
  );
}
