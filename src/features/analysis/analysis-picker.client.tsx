"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  ANALYSIS_PRESETS,
  isValidAnalysisRange,
  selectionOf,
  type AnalysisPreset,
  type AnalysisSelection,
  type AnalysisWindow,
} from "@/core/services/analysis-window";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/ui/primitives/button";
import { Card } from "@/ui/primitives/card";

import {
  analysisHref,
  isSameAnalysisSelection,
  ANALYSIS_FROM_PARAM,
  ANALYSIS_TO_PARAM,
} from "./analysis-params";

/**
 * ANALİZ DÖNEMİ SEÇİCİSİ — kokpitin ilk satırı.
 *
 * Altındaki her kart bu seçime bakar; bu yüzden seçici ekranın en üstünde ve
 * hangi aralığın açık olduğunu **yazıyla** söylüyor. "Son 30 gün" etiketi tek
 * başına yeterli değil: kullanıcı ay başında "son 30 gün"ün geçen aya taştığını
 * bilmeli, o yüzden gerçek tarih aralığı da yanında duruyor.
 *
 * Bileşen **hiçbir tarih hesabı yapmaz**. Preset → aralık çevirisi
 * `core/services/analysis-window` içinde, aralık metni sunucuda
 * (`formatDateRange`) hazırlanıyor; buraya yalnızca hazır metin iniyor.
 * Tek istisna doğrulama ve o da aynı çekirdek fonksiyonu çağırıyor —
 * ikinci bir kural yazılsaydı formun "geçerli" dediği aralık sunucuda
 * reddedilebilirdi.
 *
 * Durum yönetimi: seçim **adres çubuğunda** yaşıyor (`?period=`), buradaki
 * `useState` yalnızca henüz uygulanmamış form taslağını tutuyor. Uygulanan
 * pencerenin tek sahibi URL, dolayısıyla sunucu da onu görüyor.
 */
export function AnalysisPicker({
  window: current,
  rangeLabel,
}: {
  window: AnalysisWindow;
  /** Sunucuda biçimlenmiş aralık: "1 – 30 Tem". */
  rangeLabel: string;
}) {
  const t = useTranslations("analysis");
  const router = useRouter();
  const pathname = usePathname();

  /**
   * "Özel" seçildiği anda gezinme olmaz — önce tarihler girilir. Bu yüzden
   * formun açıklığı adresten değil, yerel durumdan gelir.
   */
  const [customOpen, setCustomOpen] = useState(current.preset === "custom");
  const [draft, setDraft] = useState(current.draft);

  const applied = selectionOf(current);
  const valid = isValidAnalysisRange(draft.from, draft.to);

  function go(selection: AnalysisSelection) {
    /**
     * Aynı pencere yeniden seçildiyse gezinme yok.
     *
     * `router.replace` aynı adrese bile olsa sunucu bileşenini yeniden
     * çalıştırır: tüm dedektörler, kâr hesabı ve eksik maliyet raporu boşuna
     * bir kez daha kurulurdu.
     */
    if (isSameAnalysisSelection(selection, applied)) return;
    // `scroll: false` — kullanıcı listenin ortasındayken dönem değiştirince
    // sayfa başa fırlamasın.
    router.replace(analysisHref(pathname, selection), { scroll: false });
  }

  function onPresetChange(preset: AnalysisPreset) {
    if (preset === "custom") {
      // Form, o an yürürlükte olan aralıkla dolu açılır: kullanıcı sıfırdan
      // tarih yazmak yerine mevcut pencereyi daraltıp genişletir.
      setDraft(current.draft);
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    go({ preset });
  }

  return (
    <Card className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label
          htmlFor="analysis-preset"
          className="text-fg text-xs font-medium whitespace-nowrap"
        >
          {t("label")}
        </label>

        <select
          id="analysis-preset"
          value={customOpen ? "custom" : current.preset}
          onChange={(event) => onPresetChange(event.target.value as AnalysisPreset)}
          className="border-border bg-surface text-fg focus-visible:ring-ring h-8 rounded-md border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
        >
          {ANALYSIS_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {t(`preset.${preset}`)}
            </option>
          ))}
        </select>

        {/* Yürürlükteki aralık her zaman görünür: etiket ile gerçek günler
            ayrışırsa kullanıcı hangi veriye baktığını bilemez. */}
        <span className="text-fg-subtle text-xs">{rangeLabel}</span>
      </div>

      {customOpen && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <DateField
              name={ANALYSIS_FROM_PARAM}
              label={t("from")}
              value={draft.from}
              invalid={!valid}
              onChange={(from) => setDraft((previous) => ({ ...previous, from }))}
            />
            <DateField
              name={ANALYSIS_TO_PARAM}
              label={t("to")}
              value={draft.to}
              invalid={!valid}
              onChange={(to) => setDraft((previous) => ({ ...previous, to }))}
            />
            <Button
              size="sm"
              disabled={!valid}
              onClick={() => go({ preset: "custom", from: draft.from, to: draft.to })}
            >
              {t("apply")}
            </Button>
          </div>

          {/*
            Doğrulama anlık: kullanıcı "Uygula"ya basıp reddedilmeyi
            beklemez. Rol `alert` — hata ekran okuyucuya da anında düşer.
          */}
          {!valid && (
            <p role="alert" className="text-danger text-xs">
              {t("invalidRange")}
            </p>
          )}
        </div>
      )}

      {/*
        Sunucudan geçersiz bir aralıkla gelindiyse (paylaşılmış bozuk bağlantı)
        analiz varsayılan pencereye düştü; kullanıcı bunu bilmeli.
      */}
      {current.invalid && valid && (
        <p role="alert" className="text-danger text-xs">
          {t("invalidRange")}
        </p>
      )}
    </Card>
  );
}

function DateField({
  name,
  label,
  value,
  invalid,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`analysis-${name}`} className="text-fg-muted text-xs">
        {label}
      </label>
      <input
        id={`analysis-${name}`}
        name={name}
        type="date"
        value={value}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-surface text-fg focus-visible:ring-ring aria-invalid:border-danger-border h-8 rounded-md border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
      />
    </div>
  );
}
