"use server";

import { revalidatePath } from "next/cache";

import {
  buildImportPreview,
  buildTemplateCsv,
  toProductCost,
  type ImportContext,
} from "@/core/services/cost-import";
import { parseCsv } from "@/core/services/csv-parse";
import { container, loadCostSource } from "@/data/container";
import { costContainer } from "@/data/cost-container";

import { countWrites, toPreviewView, type ImportPreviewView } from "./import-view";

/**
 * TOPLU MALİYET İÇE AKTARMA — sunucu eylemleri.
 *
 * İki adım, tek doğruluk kaynağı: **her iki adım da dosyanın ham metnini
 * yeniden ayrıştırır.** Önizlemede hesaplanan satırları istemciye gönderip
 * onları geri almak daha az iş olurdu ama istemciden gelen veriye
 * güvenilmez; tarayıcıda değiştirilmiş bir "yazılacaklar" listesi doğrudan
 * diske inerdi.
 *
 * Ayrıştırma deterministik olduğu için ikinci çalıştırma birincisiyle
 * birebir aynı sonucu verir — kullanıcının onayladığı şey yazılan şeydir.
 * Tek istisna: araya başka bir kayıt girerse (aynı anda manuel düzenleme)
 * "yeni/güncelleme" ayrımı değişebilir; yazılan değer değişmez.
 *
 * Hiçbir satır `commitImport` çağrılmadan yazılmaz.
 */

/** Önizlemede gösterilecek ilk satır sayısı — "doğru dosya mı" kontrolü. */
const SAMPLE_ROWS = 5;

/** Kabul edilen en büyük dosya (karakter). ~2 MB metin, on binlerce satır. */
const MAX_INPUT_LENGTH = 2_000_000;

export interface PreviewResult {
  readonly ok: boolean;
  readonly error?: "empty" | "tooLarge";
  readonly preview?: ImportPreviewView;
}

export interface CommitResult {
  readonly ok: boolean;
  readonly error?: "empty" | "tooLarge";
  readonly added?: number;
  readonly updated?: number;
  /** Değişmeyen + eşleşmeyen + geçersiz: yazılmayan her satır. */
  readonly skipped?: number;
}

async function contextFor(): Promise<ImportContext> {
  const source = await loadCostSource();
  return {
    products: source.products.map((product) => ({
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
    })),
    existing: source.costs.products,
    today: container.clock.today(),
  };
}

function guard(csvText: string): PreviewResult["error"] | undefined {
  if (csvText.trim() === "") return "empty";
  if (csvText.length > MAX_INPUT_LENGTH) return "tooLarge";
  return undefined;
}

export async function previewImport(
  csvText: string,
  locale: string,
): Promise<PreviewResult> {
  const error = guard(csvText);
  if (error) return { ok: false, error };

  const context = await contextFor();
  const preview = buildImportPreview(csvText, context);

  const { rows } = parseCsv(csvText);
  const sample = {
    headers: rows[0] ?? [],
    rows: rows.slice(1, 1 + SAMPLE_ROWS),
  };

  return {
    ok: true,
    preview: toPreviewView(preview, { locale, today: context.today, sample }),
  };
}

export async function commitImport(csvText: string): Promise<CommitResult> {
  const error = guard(csvText);
  if (error) return { ok: false, error };

  const context = await contextFor();
  const preview = buildImportPreview(csvText, context);

  const { added, updated } = countWrites(preview.toWrite);
  const skipped =
    preview.unchanged.length + preview.unmatched.length + preview.invalid.length;

  await costContainer.costs.saveProductCosts(preview.toWrite.map(toProductCost));

  // Analiz bağlamı istek başına kurulduğu için maliyet, kâr ve COST_MISSING
  // kapsamı bir sonraki render'da kendiliğinden yeniden hesaplanır; burada
  // yalnızca Next'in rota önbelleğini düşürmek gerekiyor.
  revalidatePath("/", "layout");

  return { ok: true, added, updated, skipped };
}

/**
 * İndirilebilir şablon.
 *
 * Katalogdan gerçek bir SKU ve barkod alır: kullanıcı dosyayı açtığında
 * kendi ürününü görür ve kolonların ne beklediğini örnekten anlar.
 */
export async function templateCsv(): Promise<string> {
  const source = await loadCostSource();
  const first = source.products[0];

  return buildTemplateCsv({
    sku: first?.sku ?? "SKU-1",
    barcode: first?.barcode ?? "8680000000001",
    today: container.clock.today(),
  });
}
