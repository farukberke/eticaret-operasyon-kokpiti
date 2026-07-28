import { cn } from "@/lib/cn";
import { TrendDelta } from "@/ui/patterns/trend-delta";

import type { ComparisonView } from "./comparison-view";

/**
 * Bir sonuç + önceki döneme göre durumu.
 *
 * Kokpitteki dört temel sonuç (net kâr, marj, risk toplamı, fırsat toplamı)
 * aynı kalıbı kullanır: **etiket · değer · rozet · açıklama**. Dört ayrı
 * düzen yazmak, dört ayrı yerde "önceki dönem" cümlesinin ayrışması demekti.
 *
 * `StatTile` yerine bu daha küçük kalıp kullanılıyor: `StatTile` 24px değerle
 * ekranın en dikkat çeken parçası olacak şekilde tasarlandı, oysa bu sayılar
 * kokpitte **kararın arka planı**. Kuyruktan büyük görünmemeleri gerekiyor.
 *
 * Yön yalnızca renkle anlatılmıyor: `TrendDelta` her zaman bir ok basar ve
 * altındaki cümle "arttı / azaldı / değişim yok" diye yazıyla söyler.
 */
export function ComparisonStat({
  label,
  value,
  comparison,
  className,
}: {
  label: string;
  /** Sunucuda biçimlenmiş değer: "₺142.300". */
  value: string;
  comparison: ComparisonView;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 px-4 py-3", className)}>
      <span className="text-fg-muted text-xs">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg text-lg leading-none font-semibold">{value}</span>
        <TrendDelta
          direction={comparison.direction}
          label={comparison.badge}
          higherIsBetter={comparison.meaning}
          srLabel={comparison.srLabel}
        />
      </span>
      <span className="text-fg-subtle text-xs">{comparison.caption}</span>
    </div>
  );
}
