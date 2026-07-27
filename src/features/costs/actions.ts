"use server";

import { revalidatePath } from "next/cache";

import { basisPoints, type ProductCost } from "@/core/domain";
import { costContainer } from "@/data/cost-container";

/**
 * Maliyet kaydetme — sunucu eylemi.
 *
 * Kâr hesabı sunucuda yapıldığı için maliyet de sunucuda yazılır. Kayıttan
 * sonra Next'in rota önbelleği tazelenir; analiz bağlamı zaten istek başına
 * kurulduğu için kendiliğinden yeni maliyetle yeniden hesaplanır.
 */

export interface SaveCostInput {
  readonly productId: string;
  readonly effectiveFrom: string;
  /** Kuruş cinsinden. Arayüz ondalık ayrıştırmayı kendisi yapar. */
  readonly unitCostMinor: number;
  /** Yüzde olarak; boş bırakılırsa kategori/mağaza varsayılanına düşer. */
  readonly commissionPercent?: number | undefined;
  readonly shippingMinor?: number | undefined;
  readonly packagingMinor?: number | undefined;
}

export interface SaveCostResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function saveCost(input: SaveCostInput): Promise<SaveCostResult> {
  if (!Number.isFinite(input.unitCostMinor) || input.unitCostMinor < 0) {
    return { ok: false, error: "invalidUnitCost" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    return { ok: false, error: "invalidDate" };
  }

  let commissionRate: number | undefined;
  if (input.commissionPercent !== undefined) {
    try {
      commissionRate = basisPoints(input.commissionPercent);
    } catch {
      return { ok: false, error: "invalidCommission" };
    }
  }

  const cost: ProductCost = {
    productId: input.productId,
    effectiveFrom: input.effectiveFrom,
    unitCost: { minor: Math.round(input.unitCostMinor), currency: "TRY" },
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
    source: "manual",
  };

  await costContainer.costs.saveProductCost(cost);
  // Analiz bağlamı istek başına kurulduğu için ayrıca temizlenecek bir
  // önbellek yok; yalnızca Next'in rota önbelleği tazelenir.
  revalidatePath("/", "layout");

  return { ok: true };
}
