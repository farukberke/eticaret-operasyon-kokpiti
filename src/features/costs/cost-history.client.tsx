"use client";

import { History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { EmptyState } from "@/ui/patterns/empty-state";
import { Badge, type BadgeTone } from "@/ui/primitives/badge";

import { loadCostHistory } from "./history-actions";
import type {
  CostHistoryEntryView,
  CostHistoryStatus,
  CostHistoryView,
} from "./history-view";

/**
 * MALİYET GEÇMİŞİ.
 *
 * Panel bugüne kadar maliyeti tarihsel hesaplıyor ama kullanıcıya yalnızca
 * sonucu gösteriyordu: "bu ürünün maliyeti ₺124,50". Hangi kaydın ne zamandan
 * beri hesaba girdiği görünmüyordu — kullanıcı geçen ayki kârın neden
 * bugünkü maliyetle tutmadığını ancak tahmin edebiliyordu. Bu bölüm o defteri
 * açıyor.
 *
 * Üç karar:
 *
 * 1. **Salt okunur.** Geçmiş kayıtlar düzenlenmez. Bir geçmiş kaydını
 *    değiştirmek, geçmiş ayların kârını sessizce yeniden yazmak demek; öyle bir
 *    işlem kendi onay akışını hak eder, bir listenin kenarındaki kalem
 *    simgesini değil.
 * 2. **Yürürlükteki kayıt işaretli.** Kullanıcının bu bölümde sorduğu ilk soru
 *    "şu an hangisi geçerli"; cevabı okumak için tarihleri karşılaştırmak
 *    zorunda kalmasın.
 * 3. **Yalnızca açıldığında yüklenir.** Bileşen ancak `CostEditor` açıldığında
 *    var oluyor; istek de o anda ve yalnızca o ürün için gidiyor.
 */

const TONE: Record<CostHistoryStatus, BadgeTone> = {
  active: "success",
  past: "neutral",
  upcoming: "info",
};

export function CostHistory({ productId }: { productId: string }) {
  const t = useTranslations("costs");
  // Para ve tarih biçimlendirmesi sunucuda yapılıyor; locale oraya iletilmeli.
  const locale = useLocale();

  /**
   * Sonuç, ait olduğu istekle **birlikte** tutulur.
   *
   * Ayrı bir "yükleniyor" bayrağını efektin içinde sıfırlamak, ürün
   * değiştiğinde bir render boyunca eski ürünün geçmişini ekranda bırakırdı.
   * Anahtarı sonucun yanında taşımak bu ihtimali tamamen kaldırıyor: anahtar
   * tutmuyorsa cevap henüz gelmemiştir, gösterilecek bir şey de yoktur.
   */
  const key = `${productId}|${locale}`;
  const [state, setState] = useState<{
    key: string;
    view: CostHistoryView | null;
  } | null>(null);

  useEffect(() => {
    // Kullanıcı formu kapatıp başkasını açarsa, yolda olan cevabın ekrana
    // yazılması gerekmiyor.
    let current = true;

    loadCostHistory(productId, locale)
      .then((view) => {
        if (current) setState({ key, view });
      })
      .catch(() => {
        // `view: null` = istek başarısız. Boş defterle karıştırılmaması için
        // aşağıda ayrı bir mesaj basılıyor.
        if (current) setState({ key, view: null });
      });

    return () => {
      current = false;
    };
  }, [productId, locale, key]);

  const settled = state?.key === key ? state : null;
  const view = settled?.view ?? null;
  const failed = settled !== null && settled.view === null;

  return (
    <section className="border-border flex flex-col gap-2 border-t pt-3">
      <div>
        <h3 className="text-fg flex items-center gap-1.5 text-xs font-semibold">
          <History className="text-fg-subtle size-3.5" aria-hidden />
          {t("historyTitle")}
        </h3>
        <p className="text-fg-subtle mt-0.5 text-[11px]">{t("historyDescription")}</p>
      </div>

      {failed ? (
        <p className="text-danger text-xs">{t("historyError")}</p>
      ) : view === null ? (
        <p className="text-fg-muted text-xs">{t("historyLoading")}</p>
      ) : view.entries.length === 0 ? (
        <EmptyState
          icon={<History className="size-5" aria-hidden />}
          title={t("historyEmpty")}
          description={t("historyEmptyHint")}
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {view.entries.map((entry) => (
            <HistoryEntry key={entry.key} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Tek kayıt: tarih, rozet, dört kalem ve kaydın hesaba ne zaman girdiği. */
function HistoryEntry({ entry }: { entry: CostHistoryEntryView }) {
  const t = useTranslations("costs");

  return (
    <li className="border-border bg-surface rounded-md border p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-fg tabular text-sm font-medium">
          {entry.effectiveFromLabel}
        </span>
        <Badge tone={TONE[entry.status]}>{t(`historyStatus.${entry.status}`)}</Badge>
        <span className="text-fg-subtle text-[11px]">
          {t("historySourceLabel")}: {t(`historySource.${entry.source}`)}
        </span>
      </div>

      <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Cell label={t("unitCost")} value={entry.unitCostLabel} />
        <Cell label={t("commission")} value={entry.commissionLabel} />
        <Cell label={t("shipping")} value={entry.shippingLabel} />
        <Cell label={t("packaging")} value={entry.packagingLabel} />
      </dl>

      {/*
        Rozet "ne zamandan beri" sorusunu cevaplamıyor; bu cümle cevaplıyor.
        Zaman kipi kaydın durumuna göre değişir: gelecek tarihli bir kayıt için
        "kullanıldı" demek, hiç girmediği bir hesabı ima etmek olurdu.
      */}
      <p className="text-fg-subtle mt-1.5 text-[11px]">
        {t(`historyUsed.${entry.status}`, { date: entry.effectiveFromLabel })}
      </p>
    </li>
  );
}

/**
 * Tek kalem.
 *
 * Tanımsız alan "—" değil, **"Tanımlı değil"** yazar: boş bırakılmış bir
 * komisyon o kayıtta "komisyon yok" demek değil, "kategori/mağaza varsayılanı
 * kullanılıyor" demek. Tire, kullanıcının bunu sıfır sanmasına açık kapı
 * bırakırdı.
 */
function Cell({ label, value }: { label: string; value: string | null }) {
  const t = useTranslations("costs");

  return (
    <div className="flex items-center gap-1">
      <dt className="text-fg-subtle">{label}:</dt>
      <dd className={value === null ? "text-fg-subtle" : "text-fg tabular font-medium"}>
        {value ?? t("defaultsUnset")}
      </dd>
    </div>
  );
}
