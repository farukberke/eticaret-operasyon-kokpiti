"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";

import { cn } from "@/lib/cn";
import { parseMoneyToMinor, parsePercent } from "@/lib/format";
import { Button } from "@/ui/primitives/button";

import { saveCost } from "./actions";

/**
 * Tek ürünün maliyet düzenleme formu.
 *
 * Üç şeyi bilinçli olarak açıkça gösteriyor:
 *
 * 1. **Geçerlilik tarihi** varsayılan olarak bugün. Kullanıcı ne yaptığını
 *    bilmeden geçmişi değiştirmesin.
 * 2. Geçmiş bir tarih girilirse **uyarı** çıkar: o tarihten sonraki
 *    siparişlerin kâr analizi yeniden hesaplanacak.
 * 3. Komisyon/kargo/paketleme boş bırakılabilir — o zaman kategori, o da
 *    yoksa mağaza varsayılanı kullanılır.
 */
export interface CostEditorRow {
  readonly productId: string;
  readonly name: string;
  readonly sku: string;
  readonly unitCostValue: string;
  readonly commissionValue: string;
  readonly missing: boolean;
}

function Field({
  label,
  hint,
  value,
  onChange,
  invalid,
  placeholder,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-fg-muted text-xs font-medium">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "border-border bg-surface text-fg h-9 rounded-md border px-2.5 text-sm",
          invalid && "border-danger",
        )}
      />
      {hint && <span className="text-fg-subtle text-[11px]">{hint}</span>}
    </label>
  );
}

export function CostEditor({
  row,
  today,
  onDone,
}: {
  row: CostEditorRow;
  today: string;
  onDone: () => void;
}) {
  const t = useTranslations("costs");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [unitCost, setUnitCost] = useState(row.unitCostValue);
  const [commission, setCommission] = useState(row.commissionValue);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [error, setError] = useState<string | null>(null);

  const parsedCost = parseMoneyToMinor(unitCost);
  const parsedCommission = commission.trim() === "" ? null : parsePercent(commission);

  const isPastDate = effectiveFrom < today;
  const canSave = parsedCost.ok && (parsedCommission === null || parsedCommission.ok);

  const submit = () => {
    if (!canSave) {
      setError(t("invalid"));
      return;
    }
    startTransition(async () => {
      const result = await saveCost({
        productId: row.productId,
        effectiveFrom,
        unitCostMinor: parsedCost.minor,
        ...(parsedCommission?.ok ? { commissionPercent: parsedCommission.value } : {}),
      });
      if (!result.ok) {
        setError(t("invalid"));
        return;
      }
      onDone();
      // Sunucu eylemi önbelleği geçersiz kıldı; ekranın da yeni rakamları
      // göstermesi için sunucu bileşenlerinin yeniden çalışması gerekiyor.
      router.refresh();
    });
  };

  return (
    <div className="border-border bg-surface-muted flex flex-col gap-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={t("unitCost")}
          value={unitCost}
          onChange={setUnitCost}
          invalid={unitCost !== "" && !parsedCost.ok}
          placeholder="1.234,56"
        />
        <Field
          label={`${t("commission")} (${t("optional")})`}
          hint={t("commissionHint")}
          value={commission}
          onChange={setCommission}
          invalid={parsedCommission !== null && !parsedCommission.ok}
          placeholder="%15"
        />
        <Field
          label={t("effectiveFrom")}
          hint={t("effectiveHint")}
          type="date"
          value={effectiveFrom}
          onChange={setEffectiveFrom}
        />
      </div>

      {isPastDate && <p className="text-warning text-xs">{t("pastDateWarning")}</p>}
      {error && <p className="text-danger text-xs">{error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={!canSave || pending}>
          {t("save")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
