"use client";

import { AlertTriangle, Check, FileUp, Info, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Card } from "@/ui/primitives/card";

import { commitImport, previewImport } from "./import-actions";
import type { ImportIssueView, ImportPreviewView, ImportRowView } from "./import-view";

/**
 * CSV İLE TOPLU MALİYET İÇE AKTARMA.
 *
 * Akış bilinçli olarak iki adımlı: **seç → gör → onayla**. Dosya seçmek
 * hiçbir şey yazmaz; yazma yalnızca kullanıcı dört kovayı gördükten sonra
 * "İçe aktar" düğmesine basınca olur.
 *
 * Dört kova ayrı ayrı gösteriliyor çünkü hepsi farklı bir eylem gerektirir:
 *   • Güncellenecek → onay
 *   • Değişmeyen    → bilgi, yapılacak bir şey yok
 *   • Eşleşmeyen    → SKU/barkod düzeltilmeli
 *   • Geçersiz      → satırdaki değer düzeltilmeli
 *
 * Arayüz donmaz: dosya okuma `FileReader` ile asenkron, ayrıştırma ve
 * doğrulama sunucuda, bekleme `useTransition` ile yönetiliyor.
 */

interface Props {
  /** Şablon dosyasının içeriği — sunucuda katalogdan üretilir. */
  readonly template: string;
}

export function CostImport({ template }: Props) {
  const t = useTranslations("costs");
  const router = useRouter();
  // Para ve tarih biçimlendirmesi sunucuda yapılıyor; locale oraya iletilmeli.
  const locale = useLocale();

  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    added: number;
    updated: number;
    skipped: number;
  } | null>(null);

  const reset = () => {
    setFileName(null);
    setCsvText(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const accept = (file: File) => {
    setDone(null);
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onerror = () => setError(t("importReadError"));
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      startTransition(async () => {
        const result = await previewImport(text, locale);
        if (!result.ok || !result.preview) {
          setPreview(null);
          setError(t(result.error === "tooLarge" ? "importTooLarge" : "importEmpty"));
          return;
        }
        setPreview(result.preview);
      });
    };
    // Excel'in "CSV UTF-8" çıktısı beklenen kodlama; BOM'u ayrıştırıcı atıyor.
    reader.readAsText(file, "utf-8");
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) accept(file);
  };

  const submit = () => {
    if (!csvText) return;
    startTransition(async () => {
      const result = await commitImport(csvText);
      if (!result.ok) {
        setError(t("importFailed"));
        return;
      }
      setDone({
        added: result.added ?? 0,
        updated: result.updated ?? 0,
        skipped: result.skipped ?? 0,
      });
      reset();
      // Kâr, marj ve "maliyet eksik" kapsamı sunucuda hesaplanıyor;
      // yeni rakamların ekrana gelmesi için sunucu bileşenleri yeniden çalışmalı.
      router.refresh();
    });
  };

  const writeCount = preview ? preview.counts.toWrite : 0;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-fg text-sm font-semibold">{t("importTitle")}</h2>
        <p className="text-fg-muted mt-1 text-xs">{t("importDescription")}</p>
      </div>

      {/* Dosya seçimi */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border-border flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center",
          dragging && "border-accent bg-surface-muted",
        )}
      >
        <FileUp className="text-fg-subtle size-6" aria-hidden />
        <p className="text-fg-muted text-xs">{t("importDropHint")}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            {t("importChoose")}
          </Button>
          <TemplateLink csv={template} label={t("importTemplate")} />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) accept(file);
          }}
        />
        {fileName && <p className="text-fg text-xs font-medium">{fileName}</p>}
      </div>

      <p className="text-fg-subtle flex items-start gap-2 text-[11px]">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>{t("importEncodingNotice")}</span>
      </p>

      {pending && <p className="text-fg-muted text-xs">{t("importWorking")}</p>}
      {error && <p className="text-danger text-xs">{error}</p>}

      {done && (
        <p className="text-success flex items-center gap-2 text-sm font-medium">
          <Check className="size-4" aria-hidden />
          {t("importDone", {
            added: done.added,
            updated: done.updated,
            skipped: done.skipped,
          })}
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-4">
          <SampleTable sample={preview.sample} caption={t("importSample")} />

          {preview.unknownColumns.length > 0 && (
            <p className="text-warning text-xs">
              {t("importUnknownColumns", {
                columns: preview.unknownColumns.join(", "),
              })}
            </p>
          )}

          {preview.repeated.length > 0 && (
            <p className="text-fg-muted text-xs">
              {t("importRepeated", {
                products: preview.repeated
                  .map((entry) => `${entry.productName} (${entry.count})`)
                  .join(" · "),
              })}
            </p>
          )}

          <RowBucket
            title={t("importToWrite")}
            tone="accent"
            rows={preview.toWrite}
            total={preview.counts.toWrite}
            empty={t("importNone")}
          />
          <RowBucket
            title={t("importUnchanged")}
            tone="muted"
            rows={preview.unchanged}
            total={preview.counts.unchanged}
            empty={t("importNone")}
          />
          <IssueBucket
            title={t("importUnmatched")}
            issues={preview.unmatched}
            total={preview.counts.unmatched}
          />
          <IssueBucket
            title={t("importInvalid")}
            issues={preview.invalid}
            total={preview.counts.invalid}
          />

          <div className="border-border flex flex-wrap items-center gap-2 border-t pt-3">
            <Button onClick={submit} disabled={pending || writeCount === 0} size="sm">
              {t("importConfirm", { count: writeCount })}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
              {t("cancel")}
            </Button>
            <span className="text-fg-subtle text-xs">{t("importNothingWritten")}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Şablon indirme.
 *
 * `Blob` yerine `data:` URI: dosya küçük, sunucuya gitmeye ve URL nesnesini
 * elle serbest bırakmaya gerek yok. BOM ekli, çünkü Excel BOM'suz UTF-8'i
 * Türkçe Windows'ta ANSI sanıp "Alış" yerine "AlÄ±ÅŸ" gösteriyor.
 */
function TemplateLink({ csv, label }: { csv: string; label: string }) {
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`;
  return (
    <a
      href={href}
      download="maliyet-sablonu.csv"
      className="text-accent text-xs font-medium underline underline-offset-2"
    >
      {label}
    </a>
  );
}

/** Dosyanın ilk satırları — yazmadan önce gözle doğrulama. */
function SampleTable({
  sample,
  caption,
}: {
  sample: ImportPreviewView["sample"];
  caption: string;
}) {
  if (sample.headers.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-fg-subtle text-[11px] font-medium uppercase">{caption}</p>
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-surface-muted">
            <tr>
              {sample.headers.map((header, index) => (
                <th
                  key={index}
                  className="text-fg-muted px-2 py-1.5 text-left font-medium whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-border border-t">
                {sample.headers.map((_, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="text-fg-muted tabular px-2 py-1.5 whitespace-nowrap"
                  >
                    {row[cellIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Kova kabuğu.
 *
 * `count` kovanın gerçek boyutu, `shown` ekranda listelenen satır sayısı.
 * İkisi ayrı çünkü uzun listeler kırpılıyor; kullanıcının gördüğü liste
 * eksik olsa bile rozet doğru sayıyı söylemek zorunda.
 */
function BucketShell({
  title,
  count,
  shown,
  tone,
  children,
}: {
  title: string;
  count: number;
  shown: number;
  tone: "accent" | "muted" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const t = useTranslations("costs");
  const [open, setOpen] = useState(count > 0 && tone !== "muted");

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={count === 0}
        className="flex items-center gap-2 text-left"
      >
        <Badge
          tone={
            tone === "accent"
              ? "accent"
              : tone === "warning"
                ? "warning"
                : tone === "danger"
                  ? "danger"
                  : "neutral"
          }
        >
          {count}
        </Badge>
        <span className="text-fg text-sm font-medium">{title}</span>
      </button>
      {open && count > 0 && children}
      {open && shown < count && (
        <p className="text-fg-subtle text-xs">
          {t("importTruncated", { shown, total: count })}
        </p>
      )}
    </section>
  );
}

/** Yazılacak / değişmeyen satırlar — eski ve yeni değer yan yana. */
function RowBucket({
  title,
  tone,
  rows,
  total,
  empty,
}: {
  title: string;
  tone: "accent" | "muted";
  rows: readonly ImportRowView[];
  total: number;
  empty: string;
}) {
  const t = useTranslations("costs");

  return (
    <BucketShell title={title} count={total} shown={rows.length} tone={tone}>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={`${row.line}-${row.productName}`}
            className="border-border bg-surface-muted rounded-md border p-2 text-xs"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-fg-subtle tabular">#{row.line}</span>
              <span className="text-fg font-medium">{row.productName}</span>
              <Badge tone={row.isNew ? "accent" : "neutral"}>
                {row.isNew ? t("importNew") : t("importUpdate")}
              </Badge>
              <span className="text-fg-muted">
                {t("effectiveFrom")}: {row.effectiveFrom}
              </span>
              {row.effectiveFromAssumed && (
                <span className="text-warning">{t("importDateAssumed")}</span>
              )}
              {row.isPast && (
                <span className="text-warning">{t("importPastDate")}</span>
              )}
            </div>

            {row.changes.length > 0 && (
              <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {row.changes.map((change) => (
                  <div key={change.field} className="flex items-center gap-1">
                    <dt className="text-fg-subtle">{t(change.field)}:</dt>
                    <dd className="text-fg-muted tabular flex items-center gap-1">
                      <span className="line-through">{change.before}</span>
                      <span aria-hidden>→</span>
                      <span
                        className={cn(
                          "font-medium",
                          change.action === "clear" ? "text-warning" : "text-fg",
                        )}
                      >
                        {change.action === "clear" ? t("importCleared") : change.after}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {row.changes.length === 0 && <p className="text-fg-subtle mt-1">{empty}</p>}
          </li>
        ))}
      </ul>
    </BucketShell>
  );
}

/** Eşleşmeyen ve geçersiz satırlar — satır numarası, alan, okunur sebep. */
function IssueBucket({
  title,
  issues,
  total,
}: {
  title: string;
  issues: readonly ImportIssueView[];
  total: number;
}) {
  const t = useTranslations("costs");

  return (
    <BucketShell title={title} count={total} shown={issues.length} tone="danger">
      <ul className="flex flex-col gap-1">
        {issues.map((issue) => (
          <li
            key={`${issue.line}-${issue.field}-${issue.code}`}
            className="text-fg-muted flex flex-wrap items-center gap-x-2 text-xs"
          >
            <AlertTriangle className="text-danger size-3.5 shrink-0" aria-hidden />
            <span className="text-fg-subtle tabular">
              {t("importLine", { line: issue.line })}
            </span>
            <span className="text-fg font-medium">{issue.field}</span>
            <span>{t(`importErrors.${issue.code}`)}</span>
            {issue.value !== "" && (
              <span className="text-fg-subtle">
                <X className="inline size-3" aria-hidden /> {issue.value}
              </span>
            )}
          </li>
        ))}
      </ul>
    </BucketShell>
  );
}
