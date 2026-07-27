"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "../primitives/table";

/**
 * GENERIC TABLO — projedeki tüm tabloların tek kaynağı.
 *
 * Kolonlar veriyle değil **tanımla** sürülür. Yeni bir tablo eklemek
 * `<table>` yazmak değil, bir kolon dizisi tanımlamak demek: sıralama,
 * hizalama, boş durum ve mobil kaydırma davranışı bedava gelir.
 *
 * Sayısal hücreler `tabular` sınıfı alır — sütun boyunca rakamlar hizalanır.
 * Bir veri tablosunda okunabilirliğin yarısı budur.
 */
export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: T) => ReactNode;
  /**
   * Sıralama anahtarı. Verilmezse kolon sıralanamaz — ürün adı gibi
   * bazı kolonlar için bu kasıtlı olabilir.
   */
  readonly sortValue?: (row: T) => number | string | null;
  /** Sayısal kolonlar sağa yaslanır ve tabular rakam kullanır. */
  readonly numeric?: boolean;
  readonly headerClassName?: string;
  readonly cellClassName?: string;
}

export type SortDirection = "asc" | "desc";

export interface DataTableProps<T> {
  readonly rows: readonly T[];
  readonly columns: readonly Column<T>[];
  readonly getRowId: (row: T) => string;
  readonly initialSort?: { key: string; direction: SortDirection };
  readonly emptyState?: ReactNode;
  /** Sıralanabilir başlıklar için ekran okuyucu ipucu. */
  readonly sortHint?: string;
  readonly className?: string;
}

/** `null` her zaman listenin sonuna gider — "hesaplanamaz" en iyi değer değildir. */
function compareValues(
  a: number | string | null,
  b: number | string | null,
  direction: SortDirection,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b));

  return direction === "asc" ? result : -result;
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  initialSort,
  emptyState,
  sortHint,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(
    initialSort ?? null,
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;

    const sortValue = column.sortValue;
    return [...rows].sort((a, b) =>
      compareValues(sortValue(a), sortValue(b), sort.direction),
    );
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : // İlk tıklama azalan: bir performans tablosunda kullanıcı
          // önce "en büyükler" ile ilgilenir.
          { key, direction: "desc" },
    );
  };

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <TableWrapper className={className}>
      <Table>
        <THead>
          <tr>
            {columns.map((column) => {
              const isSorted = sort?.key === column.key;
              const Icon = !isSorted
                ? ChevronsUpDown
                : sort.direction === "asc"
                  ? ArrowUp
                  : ArrowDown;

              return (
                <TH
                  key={column.key}
                  className={cn(column.numeric && "text-right", column.headerClassName)}
                  aria-sort={
                    isSorted
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cn(
                        "hover:text-fg inline-flex items-center gap-1 rounded-sm transition-colors",
                        isSorted && "text-fg",
                        column.numeric && "flex-row-reverse",
                      )}
                    >
                      {column.header}
                      <Icon className="size-3 shrink-0" aria-hidden />
                      {sortHint && <span className="sr-only">{sortHint}</span>}
                    </button>
                  ) : (
                    column.header
                  )}
                </TH>
              );
            })}
          </tr>
        </THead>

        <TBody>
          {sortedRows.map((row) => (
            <TR key={getRowId(row)}>
              {columns.map((column) => (
                <TD
                  key={column.key}
                  className={cn(
                    column.numeric && "tabular text-right",
                    column.cellClassName,
                  )}
                >
                  {column.render(row)}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrapper>
  );
}
