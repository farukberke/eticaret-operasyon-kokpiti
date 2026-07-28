"use client";

import { Info, Layers, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { parseMoneyToMinor, parsePercent } from "@/lib/format";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/patterns/empty-state";

import { Field } from "./cost-editor.client";
import { saveCostDefault } from "./default-actions";
import type { CostDefaultRowView, CostDefaultsView } from "./default-view";

/**
 * VARSAYILAN MALİYET AYARLARI.
 *
 * Ekranın taşımak zorunda olduğu tek cümle: **bu değerler yalnızca ürünün
 * kendi maliyet kaydı yoksa kullanılır.** Kullanıcı buradan bir şey
 * değiştirdiğinde ürüne özel maliyetlerinin ezildiğini düşünürse, girdiği en
 * değerli veriye güvenmeyi bırakır. Bu yüzden öncelik sırası bölümün başında
 * yazılı duruyor, her miras alınan değerin yanında kaynağı görünüyor ve
 * hiçbir metin "ürün maliyetlerini güncelle" imasında bulunmuyor.
 *
 * İkinci dürüstlük notu: burası eksik maliyet kuyruğunu kısaltmaz. Alış
 * maliyetinin varsayılanı yoktur; kuyruk yalnızca ürün bazlı kayıtla erir.
 */
export function CostDefaults({
  view,
  today,
}: {
  view: CostDefaultsView;
  today: string;
}) {
  const t = useTranslations("costs");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Öncelik sırası — bölümün ilk okunan şeyi bu olmalı. */}
      <div className="border-border bg-surface-muted flex items-start gap-2 rounded-md border p-3">
        <Info className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="text-xs">
          <p className="text-fg font-medium">{t("defaultsPrecedenceNote")}</p>
          <ol className="text-fg-muted mt-1.5 flex flex-col gap-0.5">
            <li>{t("defaultsPrecedenceProduct")}</li>
            <li>{t("defaultsPrecedenceCategory")}</li>
            <li>{t("defaultsPrecedenceStore")}</li>
          </ol>
          <p className="text-fg-subtle mt-1.5">{t("defaultsNoEffect")}</p>
        </div>
      </div>

      <DefaultRow
        row={view.store}
        today={today}
        title={t("defaultsStore")}
        icon={<Store className="text-fg-subtle size-4" aria-hidden />}
        open={editing === view.store.key}
        onToggle={() =>
          setEditing((current) => (current === view.store.key ? null : view.store.key))
        }
        onDone={() => setEditing(null)}
      />

      <section className="flex flex-col gap-2">
        <h3 className="text-fg-muted text-xs font-medium">{t("defaultsCategories")}</h3>

        {view.categories.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-5" aria-hidden />}
            title={t("defaultsNoCategories")}
            description={t("defaultsNoCategoriesHint")}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {view.categories.map((row) => (
              <li key={row.key}>
                <DefaultRow
                  row={row}
                  today={today}
                  title={row.category ?? ""}
                  icon={<Layers className="text-fg-subtle size-4" aria-hidden />}
                  open={editing === row.key}
                  onToggle={() =>
                    setEditing((current) => (current === row.key ? null : row.key))
                  }
                  onDone={() => setEditing(null)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Tek kapsam satırı: yürürlükteki üç değer + açılır düzenleme formu. */
function DefaultRow({
  row,
  today,
  title,
  icon,
  open,
  onToggle,
  onDone,
}: {
  row: CostDefaultRowView;
  today: string;
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("costs");

  return (
    <div className="border-border bg-surface rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <div className="min-w-0">
            <p className="text-fg truncate text-sm font-medium">{title}</p>
            <p className="text-fg-subtle text-xs">
              {t("defaultsProductCount", { count: row.productCount })}
              {row.effectiveFromLabel &&
                ` · ${t("defaultsSince", { date: row.effectiveFromLabel })}`}
            </p>
          </div>
        </div>

        <ValueCell label={t("commission")} value={row.commission} />
        <ValueCell label={t("shipping")} value={row.shipping} />
        <ValueCell label={t("packaging")} value={row.packaging} />

        <Button variant="outline" size="sm" onClick={onToggle}>
          {t("edit")}
        </Button>
      </div>

      {open && (
        <div className="mt-3">
          <DefaultEditor row={row} today={today} onDone={onDone} />
        </div>
      )}
    </div>
  );
}

/**
 * Tek bir kalem.
 *
 * Miras alınan değerin yanında kaynağı yazar. "₺34,90" ile "₺34,90 · mağaza
 * varsayılanından" arasındaki fark, kullanıcının o kategoriye ait olmayan bir
 * ayarı silmeye çalışıp çalışmayacağını belirler.
 */
function ValueCell({
  label,
  value,
}: {
  label: string;
  value: CostDefaultRowView["commission"];
}) {
  const t = useTranslations("costs");

  return (
    <div className="w-28 text-right">
      <p className="text-fg-subtle text-[11px]">{label}</p>
      {value.label === null ? (
        <Badge tone="neutral">{t("defaultsUnset")}</Badge>
      ) : (
        <>
          <p className="text-fg tabular text-sm font-semibold">{value.label}</p>
          {value.source === "store" && (
            <p className="text-fg-subtle text-[10px]">{t("defaultsInherited")}</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Kapsam düzenleme formu.
 *
 * Boş alan **sıfır değil, "tanımsız"** demektir ve zincir aşağı akar. Bu ayrım
 * arayüzde de görünür olmak zorunda: mağaza komisyonu boş bırakılan bir panel
 * her ürünü komisyonsuz hesaplar ve kâr olduğundan yüksek çıkar. O yüzden
 * mağaza kapsamında boş komisyon açık bir uyarı üretir.
 */
function DefaultEditor({
  row,
  today,
  onDone,
}: {
  row: CostDefaultRowView;
  today: string;
  onDone: () => void;
}) {
  const t = useTranslations("costs");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [commission, setCommission] = useState(row.commission.value);
  const [shipping, setShipping] = useState(row.shipping.value);
  const [packaging, setPackaging] = useState(row.packaging.value);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [error, setError] = useState<string | null>(null);

  const parsedCommission = commission.trim() === "" ? null : parsePercent(commission);
  const parsedShipping = shipping.trim() === "" ? null : parseMoneyToMinor(shipping);
  const parsedPackaging = packaging.trim() === "" ? null : parseMoneyToMinor(packaging);

  const isPastDate = effectiveFrom < today;
  const canSave =
    (parsedCommission === null || parsedCommission.ok) &&
    (parsedShipping === null || parsedShipping.ok) &&
    (parsedPackaging === null || parsedPackaging.ok);

  const isStore = row.kind === "store";
  /**
   * Boş alanın ne anlama geldiği **her üç kalemde de** yazılmak zorunda.
   *
   * Yalnızca komisyonda yazsaydı, kategori formunda kargoyu boş bırakan
   * kullanıcı onu "sıfır kargo" sanardı — oysa mağaza varsayılanı iniyor.
   * Cümle kapsama göre değişir çünkü davranış da değişiyor: kategoride zincir
   * mağazaya iner, mağazada inecek bir yer kalmaz.
   */
  const blankHint = isStore ? t("defaultsStoreBlankHint") : t("defaultsInheritHint");

  /**
   * Uyarı yalnızca **boş** komisyonda çıkar, açıkça yazılmış %0'da değil.
   *
   * İkisi domain'de farklı şeyler: boş alan "bu kapsam komisyonu
   * tanımlamıyor" (kayda hiç yazılmaz), `0` ise "bu kapsamda komisyon
   * yok" (kayda `commissionRate: 0` olarak yazılır ve zinciri durdurur).
   * Sonuç sayısı ikisinde de %0 olduğu için uyarı yalnızca kazayla oluşan
   * boşluğu hedefler; bilinçli sıfırı her açılışta uyarmak gürültü olurdu.
   */
  const warnZeroCommission = isStore && parsedCommission === null;

  const submit = () => {
    if (!canSave) {
      setError(t("invalid"));
      return;
    }
    startTransition(async () => {
      const result = await saveCostDefault({
        scope:
          row.category === null
            ? { kind: "store" }
            : { kind: "category", category: row.category },
        effectiveFrom,
        ...(parsedCommission?.ok ? { commissionPercent: parsedCommission.value } : {}),
        ...(parsedShipping?.ok ? { shippingMinor: parsedShipping.minor } : {}),
        ...(parsedPackaging?.ok ? { packagingMinor: parsedPackaging.minor } : {}),
      });
      if (!result.ok) {
        setError(t("invalid"));
        return;
      }
      onDone();
      // Kâr, marj ve kapsam sunucuda hesaplanıyor; yeni varsayılanın rakamlara
      // yansıması için sunucu bileşenlerinin yeniden çalışması gerekiyor.
      router.refresh();
    });
  };

  return (
    <div className="border-border bg-surface-muted flex flex-col gap-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={`${t("commission")} (${t("optional")})`}
          hint={blankHint}
          value={commission}
          onChange={setCommission}
          invalid={parsedCommission !== null && !parsedCommission.ok}
          placeholder="%15"
        />
        <Field
          label={`${t("shipping")} (${t("optional")})`}
          hint={`${t("shippingHint")} ${blankHint}`}
          value={shipping}
          onChange={setShipping}
          invalid={parsedShipping !== null && !parsedShipping.ok}
          placeholder="34,90"
        />
        <Field
          label={`${t("packaging")} (${t("optional")})`}
          hint={`${t("packagingHint")} ${blankHint}`}
          value={packaging}
          onChange={setPackaging}
          invalid={parsedPackaging !== null && !parsedPackaging.ok}
          placeholder="2,50"
        />
        <Field
          label={t("effectiveFrom")}
          hint={t("defaultsEffectiveHint")}
          type="date"
          value={effectiveFrom}
          onChange={setEffectiveFrom}
        />
      </div>

      {warnZeroCommission && (
        <p className="text-warning text-xs">{t("defaultsCommissionZeroWarning")}</p>
      )}
      {isPastDate && (
        <p className="text-warning text-xs">{t("defaultsPastDateWarning")}</p>
      )}
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
