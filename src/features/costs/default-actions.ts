"use server";

import { revalidatePath } from "next/cache";

import { basisPoints, type CostDefault, type CostScope } from "@/core/domain";
import { loadCostSource } from "@/data/container";
import { costContainer } from "@/data/cost-container";

/**
 * VARSAYILAN MALİYET AYARLARI — sunucu eylemi.
 *
 * Yazdığı şey `CostDefault`: komisyon, kargo, paketleme. **Alış maliyeti
 * kabul etmez** ve etmemeli — bir ürünün alış fiyatının kategori ya da mağaza
 * varsayılanı olamaz, olsaydı panel uydurma kâr üretirdi.
 *
 * Kaydetmek mevcut kaydı düzenlemek değil, `kapsam@tarih` anahtarıyla
 * **tarihli bir kayıt açmaktır**. Bugünden itibaren geçerli bir mağaza
 * varsayılanı, geçen ayın siparişlerinin kârını değiştirmez; o siparişler
 * kendi tarihlerinde yürürlükte olan varsayılanla hesaplanmaya devam eder.
 *
 * Ürüne özel maliyet kayıtlarına **hiç dokunmaz**: çözümleme zinciri her alan
 * için önce ürünün kendi kaydına bakar, buraya ancak orada bir değer yoksa
 * iner.
 */

export interface SaveCostDefaultInput {
  readonly scope: CostScope;
  readonly effectiveFrom: string;
  /**
   * Yüzde olarak. `undefined` = bu kapsam komisyonu tanımlamıyor; zincir
   * aşağı akar (kategori → mağaza → %0).
   */
  readonly commissionPercent?: number | undefined;
  /** Kuruş cinsinden. `undefined` = tanımsız, sıfır değil. */
  readonly shippingMinor?: number | undefined;
  readonly packagingMinor?: number | undefined;
}

export interface SaveCostDefaultResult {
  readonly ok: boolean;
  readonly error?:
    | "invalidDate"
    | "invalidCommission"
    | "invalidShipping"
    | "invalidPackaging"
    | "unknownCategory";
}

/** Negatif olmayan, sonlu kuruş değeri. Boş bırakılmış alan geçerlidir. */
function invalidMinor(value: number | undefined): boolean {
  return value !== undefined && (!Number.isFinite(value) || value < 0);
}

export async function saveCostDefault(
  input: SaveCostDefaultInput,
): Promise<SaveCostDefaultResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    return { ok: false, error: "invalidDate" };
  }

  /**
   * Kategori katalogla doğrulanır.
   *
   * Sunucu eylemi istemciden gelen ham veriyi alır; tarayıcıda değiştirilmiş
   * bir kategori adı, hiçbir ürüne dokunmayan ölü bir kayıt olarak dosyada
   * kalırdı — kullanıcı ayarı yaptığını sanıp sonucunu hiç göremezdi.
   */
  if (input.scope.kind === "category") {
    // Daraltma yerel değişkende tutulur; kapanışın içinde `input.scope`
    // yeniden okunsaydı TypeScript birleşimi tekrar genişletirdi.
    const { category } = input.scope;
    const { products } = await loadCostSource();
    if (!products.some((product) => product.category === category)) {
      return { ok: false, error: "unknownCategory" };
    }
  }

  if (invalidMinor(input.shippingMinor)) return { ok: false, error: "invalidShipping" };
  if (invalidMinor(input.packagingMinor)) {
    return { ok: false, error: "invalidPackaging" };
  }

  let commissionRate: number | undefined;
  if (input.commissionPercent !== undefined) {
    try {
      commissionRate = basisPoints(input.commissionPercent);
    } catch {
      return { ok: false, error: "invalidCommission" };
    }
  }

  const entry: CostDefault = {
    scope: input.scope,
    effectiveFrom: input.effectiveFrom,
    ...(commissionRate !== undefined ? { commissionRate } : {}),
    ...(input.shippingMinor !== undefined
      ? {
          shippingCost: {
            minor: Math.round(input.shippingMinor),
            currency: "TRY" as const,
          },
        }
      : {}),
    ...(input.packagingMinor !== undefined
      ? {
          packagingPerUnit: {
            minor: Math.round(input.packagingMinor),
            currency: "TRY" as const,
          },
        }
      : {}),
  };

  await costContainer.costs.saveDefault(entry);

  // Analiz bağlamı istek başına kurulduğu için kâr, marj ve eksik maliyet
  // kuyruğu bir sonraki render'da kendiliğinden yeniden hesaplanır; burada
  // yalnızca Next'in rota önbelleğini düşürmek gerekiyor.
  revalidatePath("/", "layout");

  return { ok: true };
}
