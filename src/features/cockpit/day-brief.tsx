/**
 * GÜNÜN TEK CÜMLESİ — ekranın ilk 5 saniyesi.
 *
 * Kullanıcı başka hiçbir şey okumasa bile buradan çıkması gereken üç bilgi:
 * kaç iş var, yapılırsa ne kazanılır, ne kadar acele var.
 *
 * KPI kutusu değil, **cümle**. Bir sayı ("₺71.176") kullanıcıya bunun iyi mi
 * kötü mü olduğunu düşündürür; bir cümle ("yaparsan ₺71.176 kâr korunur")
 * düşünmeyi ortadan kaldırır.
 *
 * Saf sunum bileşeni: hesap kuyruğun içinde yapılır, çünkü kullanıcı iş
 * kapattıkça bu cümlenin de anında değişmesi gerekir.
 */
export function DayBrief({
  headline,
  stake,
  dueToday,
}: {
  headline: string;
  stake?: string | undefined;
  dueToday?: string | undefined;
}) {
  return (
    <section className="pb-1">
      <p className="text-fg text-xl leading-snug font-semibold tracking-tight sm:text-2xl">
        {headline}
        {stake && <span className="text-fg-muted font-normal"> {stake}</span>}
      </p>
      {dueToday && <p className="text-danger mt-1.5 text-sm font-medium">{dueToday}</p>}
    </section>
  );
}
