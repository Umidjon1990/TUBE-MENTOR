import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  Loader2,
  Receipt,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import AdminLayout from "@/components/layouts/admin-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Lesson } from "@shared/schema";
import { publishedLesson } from "@shared/learning";
import {
  DEFAULT_COMMERCE_SETTINGS,
  type CommerceSettings,
  type CoinPackageDTO,
  type PaymentOrderDTO,
  type PaymentReviewInput,
  type WalletDTO,
  type SupportTicketDTO,
  type SupportThreadDTO,
} from "@shared/commerce";

const money = (value: number) => `${value.toLocaleString("uz-UZ")} so‘m`;
const date = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(parsed.getDate())}.${pad(parsed.getMonth() + 1)}.${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};
const card = (value: string) => {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{16}$/.test(digits)
    ? digits.replace(/(\d{4})(?=\d)/g, "$1 ")
    : value;
};
const statusLabels: Record<string, string> = {
  created: "Yaratildi",
  awaiting_payment: "To‘lov kutilmoqda",
  receipt_submitted: "Chek yuborildi",
  under_review: "Tekshirilmoqda",
  needs_info: "Aniqlashtirish kerak",
  approved: "Tasdiqlandi",
  rejected: "Rad etildi",
  cancelled: "Bekor qilindi",
  expired: "Muddati tugadi",
  partially_refunded: "Qisman qaytarildi",
  refunded: "Qaytarildi",
};
const reviewedStatuses = new Set([
  "receipt_submitted",
  "under_review",
  "needs_info",
  "expired",
  "rejected",
]);
function Status({ value }: { value: string }) {
  return (
    <span className={`commerce-tag ${value}`}>
      {statusLabels[value] || value}
    </span>
  );
}
function Busy() {
  return (
    <p className="commerce-empty" role="status">
      <Loader2 className="inline-block animate-spin mr-2" size={18} />
      Yuklanmoqda…
    </p>
  );
}
function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="commerce-error" role="alert">
      <p>
        {error instanceof Error ? error.message : "Ma’lumotni yuklab bo‘lmadi."}
      </p>
      <Button variant="outline" onClick={retry} className="mt-3">
        <RefreshCw size={16} className="mr-2" />
        Qayta yuklash
      </Button>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="commerce-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function invalidateCommerce() {
  queryClient.invalidateQueries({
    predicate: (query) =>
      String(query.queryKey[0]).startsWith("/api/admin/commerce") ||
      String(query.queryKey[0]).startsWith("/api/commerce") ||
      String(query.queryKey[0]).startsWith("/api/admin/users"),
  });
}

type Overview = {
  pendingOrders: number;
  approvedOrders: number;
  revenueUzs: number;
  coinsIssued: number;
  coinsSpent: number;
  totalBalance: number;
  activePackages: number;
  notificationFailures: number;
};
export function AdminCommerceDashboard() {
  const overview = useQuery<Overview>({
    queryKey: ["/api/admin/commerce/overview"],
    refetchInterval: 30000,
  });
  const stats = overview.data
    ? [
        ["Tekshiruv kutilmoqda", overview.data.pendingOrders, "buyurtma"],
        [
          "Tasdiqlangan tushum",
          money(overview.data.revenueUzs),
          "tasdiqlangan buyurtmalar",
        ],
        ["Coin qo‘shilgan", overview.data.coinsIssued, "coin"],
        ["Darsga sarflangan", overview.data.coinsSpent, "coin"],
        ["Jami balans", overview.data.totalBalance, "coin"],
        ["Tasdiqlangan buyurtmalar", overview.data.approvedOrders, "buyurtma"],
        ["Faol paketlar", overview.data.activePackages, "paket"],
        [
          "Yuborilmagan bot xabarlari",
          overview.data.notificationFailures,
          "qayta yuborish kutilmoqda",
        ],
      ]
    : [];
  return (
    <AdminLayout
      title="Admin dashboardi"
      subtitle="Darslar, o‘quvchilar va to‘lovlarni bir joydan boshqaring"
    >
      <div className="admin-commerce">
        {overview.isLoading ? (
          <Busy />
        ) : overview.isError ? (
          <QueryError error={overview.error} retry={() => overview.refetch()} />
        ) : (
          <div className="commerce-stats">
            {stats.map(([label, value, unit]) => (
              <div className="commerce-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <span>{unit}</span>
              </div>
            ))}
          </div>
        )}
        <Panel title="Hisobotlarni yuklash">
          <p className="commerce-muted">
            Saqlangan barcha buyurtmalar, coin harakatlari va admin qarorlari
            CSV faylda.
          </p>
          <div className="commerce-actions">
            <a
              className="commerce-link"
              href="/api/admin/commerce/export?type=orders"
            >
              To‘lovlar CSV
            </a>
            <a
              className="commerce-link"
              href="/api/admin/commerce/export?type=ledger"
            >
              Coin harakatlari CSV
            </a>
            <a
              className="commerce-link"
              href="/api/admin/commerce/export?type=audit"
            >
              Admin amallari CSV
            </a>
          </div>
        </Panel>
        <div className="commerce-grid">
          <Panel title="To‘lovlarni tekshirish">
            <p className="commerce-muted">
              Chekni va haqiqiy bank tushumini solishtiring. Tasdiqlangan
              buyurtma coinni aynan bir marta qo‘shadi.
            </p>
            <Link href="/admin/payments" className="commerce-link">
              <Receipt size={17} />
              Buyurtmalarni ochish <ArrowRight size={16} />
            </Link>
          </Panel>
          <Panel title="Darslar va mavzular">
            <p className="commerce-muted">
              Darsni yarating, subtitr, lug‘at va yakuniy testni tekshiring.
              Tayyor darsni o‘quvchilar uchun nashr qiling.
            </p>
            <div className="commerce-actions">
              <Link href="/admin/lessons/new" className="commerce-link">
                Dars yaratish <ArrowRight size={16} />
              </Link>
              <Link href="/admin/courses" className="commerce-link">
                Mavzular
              </Link>
            </div>
          </Panel>
          <Panel title="Coin paketlari">
            <p className="commerce-muted">
              Paket narxlarini kiriting va kerakli paketlarni faollashtiring.
              Narxi belgilanmagan paket sotuvga chiqmaydi.
            </p>
            <Link href="/admin/packages" className="commerce-link">
              <Coins size={17} />
              Paketlarni boshqarish
            </Link>
          </Panel>
          <Panel title="Ishga tushirish sozlamalari">
            <p className="commerce-muted">
              Namuna dars, to‘lov rekvizitlari, tekshirish ish vaqti va Telegram
              bildirishnomalarini sozlang.
            </p>
            <Link href="/admin/commerce-settings" className="commerce-link">
              <ShieldCheck size={17} />
              Sozlamalarni ochish
            </Link>
          </Panel>
          <Panel title="O‘quvchilar murojaatlari">
            <p className="commerce-muted">
              To‘lov, dars yoki qaytarish bo‘yicha savollarga javob bering. Har
              bir murojaat o‘quvchi va tegishli buyurtma bilan bog‘lanadi.
            </p>
            <Link href="/admin/support" className="commerce-link">
              Murojaatlarni ko‘rish <ArrowRight size={16} />
            </Link>
          </Panel>
        </div>
      </div>
    </AdminLayout>
  );
}

export function AdminPaymentOrders() {
  const orders = useQuery<{ orders: PaymentOrderDTO[] }>({
    queryKey: ["/api/admin/commerce/orders"],
    refetchInterval: 20000,
  });
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const filtered = (orders.data?.orders || []).filter(
    (order) =>
      (status === "all" ||
        (status === "pending"
          ? ["receipt_submitted", "under_review", "needs_info"].includes(
              order.status,
            )
          : order.status === status)) &&
      `${order.id} ${order.fullName || ""} ${order.userId || ""} ${order.bankReference || ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <AdminLayout
      title="To‘lov buyurtmalari"
      subtitle="Cheklar, haqiqiy tushumlar va coin qo‘shish holati"
    >
      <div className="admin-commerce">
        <div className="commerce-toolbar">
          <p className="commerce-muted">
            Eng so‘nggi 200 buyurtma. To‘liq tarixni CSV orqali yuklang.
          </p>
          <a
            className="commerce-link"
            href="/api/admin/commerce/export?type=orders"
          >
            To‘lovlar CSV
          </a>
        </div>
        <div className="commerce-grid">
          <div className="commerce-field">
            <label htmlFor="order-search">
              Buyurtma yoki o‘quvchi qidirish
            </label>
            <input
              id="order-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buyurtma raqami, ism yoki bank raqami"
            />
          </div>
          <div className="commerce-field">
            <label htmlFor="order-status">Holat</label>
            <select
              id="order-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="pending">
                Tekshiruv va aniqlashtirish kutilmoqda
              </option>
              <option value="all">Barcha buyurtmalar</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {orders.isLoading ? (
          <Busy />
        ) : orders.isError ? (
          <QueryError error={orders.error} retry={() => orders.refetch()} />
        ) : (
          <div className="commerce-list">
            {filtered.length === 0 ? (
              <div className="commerce-panel commerce-empty">
                Bu holatda buyurtma yo‘q.
              </div>
            ) : (
              filtered.map((order) => (
                <article className="commerce-row" key={order.id}>
                  <div>
                    <strong>
                      {order.fullName || order.userId || "O‘quvchi"}
                    </strong>
                    <p className="commerce-muted">
                      {order.packageName} · {order.coins} coin ·{" "}
                      {money(order.priceUzs)}
                    </p>
                    <p className="commerce-muted commerce-reference">
                      #{order.id} · {date(order.createdAt)}
                    </p>
                  </div>
                  <div className="commerce-actions">
                    <Status value={order.status} />
                    <Link
                      href={`/admin/payments/${order.id}`}
                      className="commerce-link"
                    >
                      Ko‘rish <ArrowRight size={16} />
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export function AdminPaymentOrder() {
  const [, params] = useRoute("/admin/payments/:id");
  const orderQuery = useQuery<PaymentOrderDTO>({
    queryKey: [`/api/admin/commerce/orders/${params?.id}`],
    enabled: !!params?.id,
    refetchInterval: 20000,
  });
  const order = orderQuery.data;
  const { toast } = useToast();
  const [action, setAction] = useState<
    PaymentReviewInput["decision"] | "refund" | null
  >(null);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [refundCoins, setRefundCoins] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!order || !action) throw new Error("Buyurtma yuklanmagan.");
      const endpoint = `/api/admin/commerce/orders/${order.id}/${action === "refund" ? "refund" : "review"}`;
      const body =
        action === "refund"
          ? {
              coins: refundCoins,
              bankReference: reference.trim(),
              reason: reason.trim(),
            }
          : {
              decision: action,
              bankReference: reference.trim() || undefined,
              reason: reason.trim() || undefined,
            };
      return (await apiRequest("POST", endpoint, body)).json();
    },
    onSuccess: () => {
      invalidateCommerce();
      setAction(null);
      toast({
        title: "Buyurtma yangilandi",
        description: "Natija va balans serverda saqlandi.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Amal bajarilmadi",
        description: error.message,
        variant: "destructive",
      }),
  });
  function openAction(next: typeof action) {
    setAction(next);
    setReference("");
    setReason("");
    setConfirmed(false);
    setRefundCoins(
      Math.max(0, (order?.coins || 0) - (order?.refundedCoins || 0)),
    );
  }
  const requiresBank = action === "approve" || action === "refund";
  const requiresReason =
    action !== "approve" ||
    (!!order && ["expired", "rejected"].includes(order.status));
  const actionValid =
    !!action &&
    confirmed &&
    (!requiresBank || reference.trim().length >= 3) &&
    (!requiresReason || reason.trim().length >= 3) &&
    (action !== "refund" ||
      (Number.isInteger(refundCoins) &&
        refundCoins > 0 &&
        refundCoins <= (order?.coins || 0) - (order?.refundedCoins || 0)));
  const actionTitles = {
    approve: "To‘lovni tasdiqlash",
    reject: "To‘lovni rad etish",
    needs_info: "Aniqlashtirish so‘rash",
    refund: "Qaytarishni qayd etish",
  };
  return (
    <AdminLayout
      title="Buyurtma tafsilotlari"
      subtitle="To‘lov qarori va coin balansiga ta’siri"
    >
      <div className="admin-commerce">
        <Link href="/admin/payments" className="commerce-link">
          <ArrowLeft size={17} />
          Barcha buyurtmalar
        </Link>
        {orderQuery.isLoading ? (
          <Busy />
        ) : orderQuery.isError ? (
          <QueryError
            error={orderQuery.error}
            retry={() => orderQuery.refetch()}
          />
        ) : (
          order && (
            <>
              <Panel title={order.packageName}>
                <div className="commerce-toolbar mb-5">
                  <p className="commerce-muted commerce-reference">
                    #{order.id}
                  </p>
                  <Status value={order.status} />
                </div>
                <dl className="commerce-details">
                  <div>
                    <dt>O‘quvchi</dt>
                    <dd>{order.fullName || order.userId || "—"}</dd>
                  </div>
                  <div>
                    <dt>Summa</dt>
                    <dd>{money(order.priceUzs)}</dd>
                  </div>
                  <div>
                    <dt>Coin</dt>
                    <dd>{order.coins}</dd>
                  </div>
                  <div>
                    <dt>Qaytarilgan coin</dt>
                    <dd>{order.refundedCoins || 0}</dd>
                  </div>
                  <div>
                    <dt>Yaratilgan</dt>
                    <dd>{date(order.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>To‘lov muddati</dt>
                    <dd>{date(order.expiresAt)}</dd>
                  </div>
                  <div>
                    <dt>Bank tranzaksiya raqami</dt>
                    <dd>{order.bankReference || "Kiritilmagan"}</dd>
                  </div>
                  <div>
                    <dt>Izoh</dt>
                    <dd>{order.reason || "—"}</dd>
                  </div>
                </dl>
              </Panel>
              <Panel title="Yuborilgan cheklar">
                {order.duplicateReceiptWarning && (
                  <div role="alert" className="commerce-notice mb-4">
                    Shu chek rasmi boshqa buyurtmada ham yuborilgan. Bank
                    tranzaksiyasini tekshiring; bir to‘lovga coin ikki marta
                    berilmasin.
                  </div>
                )}
                <p className="commerce-muted">
                  Chek rasmi bilan haqiqiy bank tushumini solishtiring.
                  Buyurtmadagi summa va qabul qiluvchi mos bo‘lishi kerak.
                </p>
                {order.receipts.length ? (
                  <div className="commerce-receipts">
                    {order.receipts.map((receipt) => (
                      <a
                        key={receipt.id}
                        href={receipt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {receipt.mimeType.startsWith("image/") ? (
                          <img
                            src={receipt.url}
                            alt="O‘quvchi yuborgan to‘lov cheki"
                          />
                        ) : (
                          <div className="commerce-empty">
                            PDF chekni ochish
                          </div>
                        )}
                        <span>{receipt.originalName}</span>
                        {receipt.duplicateWarning && (
                          <span className="text-amber-800">
                            Boshqa buyurtmada ham ishlatilgan
                          </span>
                        )}
                        <span className="commerce-muted">
                          {date(receipt.createdAt)}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="commerce-empty">Hali chek yuborilmagan.</p>
                )}
              </Panel>
              <Panel title="To‘lov rekvizitlari">
                <dl className="commerce-details">
                  <div>
                    <dt>Qabul qiluvchi</dt>
                    <dd>{order.instructions.recipientName || "—"}</dd>
                  </div>
                  <div>
                    <dt>Karta</dt>
                    <dd>
                      {order.instructions.cardNumber
                        ? card(order.instructions.cardNumber)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Yo‘riqnoma</dt>
                    <dd>{order.instructions.paymentInstructions || "—"}</dd>
                  </div>
                  <div>
                    <dt>Tekshirish vaqti</dt>
                    <dd>{order.instructions.reviewHours || "—"}</dd>
                  </div>
                </dl>
              </Panel>
              {reviewedStatuses.has(order.status) && (
                <Panel title="Admin qarori">
                  <div className="commerce-notice mb-4">
                    Pul kelib tushganini bank yoki Payme tarixidan tekshiring.
                    Tasdiqlash uchun noyob bank tranzaksiya raqami kerak.
                  </div>
                  <div className="commerce-actions">
                    <Button
                      disabled={!order.receipts.length}
                      onClick={() => openAction("approve")}
                    >
                      Tasdiqlash
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openAction("needs_info")}
                    >
                      Aniqlashtirish
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => openAction("reject")}
                    >
                      Rad etish
                    </Button>
                  </div>
                </Panel>
              )}
              {["approved", "partially_refunded"].includes(order.status) && (
                <Panel title="Qaytarish">
                  <p className="commerce-muted mb-4">
                    Pulni bank orqali qaytarish alohida bajariladi. Bu amal
                    qaytarish sababini va tranzaksiya raqamini saqlab, mavjud
                    coinni kamaytiradi. Sarflangan coin bo‘yicha dars
                    huquqlarini o‘quvchi kartasidan ko‘rib chiqing.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => openAction("refund")}
                  >
                    Qaytarishni qayd etish
                  </Button>
                </Panel>
              )}
            </>
          )
        )}
      </div>
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setAction(null);
        }}
      >
        <DialogContent className="commerce-modal">
          <DialogHeader>
            <DialogTitle>
              {action ? actionTitles[action] : "Buyurtma qarori"}
            </DialogTitle>
            <DialogDescription>
              {action === "approve"
                ? `${money(order?.priceUzs || 0)} to‘lov tasdiqlansa, o‘quvchiga ${order?.coins || 0} coin qo‘shiladi.`
                : "Har bir qaror admin amallari tarixida saqlanadi."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="commerce-fields"
            onSubmit={(event) => {
              event.preventDefault();
              if (actionValid) mutation.mutate();
            }}
          >
            {requiresBank && (
              <div className="commerce-field">
                <label htmlFor="bank-reference">
                  {action === "refund"
                    ? "Pulni qaytarish tranzaksiya raqami"
                    : "Bank tranzaksiya raqami"}
                </label>
                <input
                  id="bank-reference"
                  required
                  minLength={3}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
            {action === "refund" && (
              <div className="commerce-field">
                <label htmlFor="refund-coins">Qaytariladigan coin</label>
                <input
                  id="refund-coins"
                  type="number"
                  min={1}
                  max={(order?.coins || 0) - (order?.refundedCoins || 0)}
                  step={1}
                  value={refundCoins || ""}
                  onChange={(event) =>
                    setRefundCoins(Number(event.target.value))
                  }
                  required
                />
              </div>
            )}
            <div className="commerce-field">
              <label htmlFor="review-reason">
                {requiresReason
                  ? "Sabab va o‘quvchiga izoh"
                  : "Izoh (ixtiyoriy)"}
              </label>
              <textarea
                id="review-reason"
                required={requiresReason}
                minLength={requiresReason ? 3 : undefined}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <label className="commerce-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {action === "approve"
                ? "Haqiqiy bank tushumi, summa va qabul qiluvchini tekshirdim."
                : action === "refund"
                  ? "Pulni qaytarish va uning coin balansiga ta’sirini tekshirdim."
                  : "Buyurtmani tekshirdim va kiritilgan sababni tasdiqlayman."}
            </label>
            <Button type="submit" disabled={!actionValid || mutation.isPending}>
              {mutation.isPending && (
                <Loader2 size={16} className="animate-spin mr-2" />
              )}
              {action ? actionTitles[action] : "Saqlash"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function PackageEditor({
  item,
  onCreated,
}: {
  item?: CoinPackageDTO;
  onCreated?: () => void;
}) {
  const [form, setForm] = useState({
    name: item?.name || "",
    coins: item?.coins || 50,
    priceUzs: item?.priceUzs || 0,
    isActive: item?.isActive || false,
  });
  const { toast } = useToast();
  useEffect(() => {
    if (item)
      setForm({
        name: item.name,
        coins: item.coins,
        priceUzs: item.priceUzs,
        isActive: item.isActive,
      });
  }, [item]);
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest(
          item ? "PATCH" : "POST",
          `/api/admin/commerce/packages${item ? `/${item.id}` : ""}`,
          form,
        )
      ).json(),
    onSuccess: () => {
      invalidateCommerce();
      toast({ title: "Paket saqlandi" });
      if (!item) {
        setForm({ name: "", coins: 50, priceUzs: 0, isActive: false });
        onCreated?.();
      }
    },
    onError: (error: Error) =>
      toast({
        title: "Paket saqlanmadi",
        description: error.message,
        variant: "destructive",
      }),
  });
  const valid =
    form.name.trim().length >= 2 &&
    Number.isInteger(form.coins) &&
    form.coins > 0 &&
    Number.isInteger(form.priceUzs) &&
    form.priceUzs >= 0 &&
    (!form.isActive || form.priceUzs > 0);
  return (
    <form
      className="commerce-fields"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) mutation.mutate();
      }}
    >
      <div className="commerce-field">
        <label htmlFor={`package-name-${item?.id || "new"}`}>Paket nomi</label>
        <input
          id={`package-name-${item?.id || "new"}`}
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
          minLength={2}
        />
      </div>
      <div className="commerce-grid">
        <div className="commerce-field">
          <label htmlFor={`package-coins-${item?.id || "new"}`}>
            Coin miqdori
          </label>
          <input
            id={`package-coins-${item?.id || "new"}`}
            type="number"
            min={1}
            step={1}
            required
            value={form.coins || ""}
            onChange={(event) =>
              setForm({ ...form, coins: Number(event.target.value) })
            }
          />
        </div>
        <div className="commerce-field">
          <label htmlFor={`package-price-${item?.id || "new"}`}>
            Narxi (so‘m)
          </label>
          <input
            id={`package-price-${item?.id || "new"}`}
            type="number"
            min={form.isActive ? 1 : 0}
            step={1}
            required
            value={form.priceUzs}
            onChange={(event) =>
              setForm({ ...form, priceUzs: Number(event.target.value) })
            }
          />
        </div>
      </div>
      <label className="commerce-check">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) =>
            setForm({ ...form, isActive: event.target.checked })
          }
        />
        Sotuvda faol
      </label>
      {form.isActive && form.priceUzs < 1 && (
        <p className="commerce-error">Faol paket uchun narxni kiriting.</p>
      )}
      <Button type="submit" disabled={!valid || mutation.isPending}>
        {mutation.isPending && (
          <Loader2 size={16} className="animate-spin mr-2" />
        )}
        {item ? "Saqlash" : "Paket yaratish"}
      </Button>
    </form>
  );
}
export function AdminCoinPackages() {
  const packages = useQuery<{ packages: CoinPackageDTO[] }>({
    queryKey: ["/api/admin/commerce/packages"],
  });
  const [create, setCreate] = useState(false);
  return (
    <AdminLayout
      title="Coin paketlari"
      subtitle="Narxlar va coin miqdorini boshqaring"
    >
      <div className="admin-commerce">
        <div className="commerce-toolbar">
          <p className="commerce-muted">
            1 oddiy dars — 10 coin. Narxi va sotuv holati ko‘rsatilgan paketlar
            o‘quvchiga chiqadi.
          </p>
          <Button onClick={() => setCreate(!create)}>
            {create ? "Yopish" : "Yangi paket"}
          </Button>
        </div>
        {create && (
          <Panel title="Yangi paket">
            <PackageEditor onCreated={() => setCreate(false)} />
          </Panel>
        )}
        {packages.isLoading ? (
          <Busy />
        ) : packages.isError ? (
          <QueryError error={packages.error} retry={() => packages.refetch()} />
        ) : (
          <div className="commerce-grid">
            {packages.data?.packages.length ? (
              packages.data.packages.map((item) => (
                <Panel title={item.name} key={item.id}>
                  <div className="commerce-toolbar mb-5">
                    <p className="commerce-muted">
                      {Math.floor(item.coins / 10)} ta darsga yetadi
                    </p>
                    <span
                      className={`commerce-tag ${item.isActive ? "active" : ""}`}
                    >
                      {item.isActive ? "Faol" : "Sotuvda emas"}
                    </span>
                  </div>
                  <PackageEditor item={item} />
                </Panel>
              ))
            ) : (
              <div className="commerce-empty">Paket yaratilmagan.</div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

type BotStatus = {
  available: boolean;
  linked: boolean;
  botUsername: string | null;
  adminConfigured: boolean;
};
function AdminBotPairing() {
  const query = useQuery<BotStatus>({
    queryKey: ["/api/commerce/telegram/status"],
    refetchInterval: 15000,
  });
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/commerce/telegram/link", {})
      ).json() as Promise<{ url: string; expiresAt: string }>,
    onSuccess: (result) => setUrl(result.url),
    onError: (error: Error) =>
      toast({
        title: "Botni ulab bo‘lmadi",
        description: error.message,
        variant: "destructive",
      }),
  });
  return (
    <Panel title="Telegram admin boti">
      {query.isLoading ? (
        <Busy />
      ) : query.isError ? (
        <QueryError error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <p className="commerce-muted mb-4">
            Bot orqali chek xabarlari keladi. Saytdagi to‘lov boshqaruvi bot
            ulanmagan holatda ham ishlaydi.
          </p>
          <p className="mb-3">
            {query.data?.available
              ? query.data.linked
                ? "Sizning Telegram hisobingiz ulangan."
                : "Bot tayyor. Admin hisobingizni ulashing."
              : "Bot tokeni hali serverda sozlanmagan."}
          </p>
          {query.data?.available && !query.data.adminConfigured && (
            <div className="commerce-notice mb-4">
              Bildirishnomalar uchun kamida bitta admin botni ulashi va
              serverdagi adminlar ro‘yxatida bo‘lishi kerak.
            </div>
          )}
          {query.data?.available && (
            <div className="commerce-actions">
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending
                  ? "Havola yaratilmoqda…"
                  : query.data.linked
                    ? "Botni qayta ulash"
                    : "Telegram hisobini ulash"}
              </Button>
              {url && (
                <a
                  className="commerce-link"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Telegramda ochish <ArrowRight size={16} />
                </a>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
export function AdminCommerceSettings() {
  const settings = useQuery<CommerceSettings>({
    queryKey: ["/api/admin/commerce/settings"],
  });
  const packages = useQuery<{ packages: CoinPackageDTO[] }>({
    queryKey: ["/api/admin/commerce/packages"],
  });
  const lessons = useQuery<Lesson[]>({
    queryKey: ["/api/admin/lessons"],
  });
  const [form, setForm] = useState<CommerceSettings>({
    ...DEFAULT_COMMERCE_SETTINGS,
  });
  const { toast } = useToast();
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);
  const mutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("PUT", "/api/admin/commerce/settings", form)).json(),
    onSuccess: () => {
      invalidateCommerce();
      toast({ title: "Sozlamalar saqlandi" });
    },
    onError: (error: Error) =>
      toast({
        title: "Sozlamalar saqlanmadi",
        description: error.message,
        variant: "destructive",
      }),
  });
  const activePackages =
    packages.data?.packages.filter((item) => item.isActive && item.priceUzs > 0)
      .length || 0;
  let paymeValid = !form.paymeUrl;
  if (form.paymeUrl) {
    try {
      const url = new URL(form.paymeUrl);
      paymeValid =
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === "443") &&
        /(^|\.)(payme\.uz|paycom\.uz)$/.test(url.hostname);
    } catch {
      paymeValid = false;
    }
  }
  const cardValid =
    !form.cardNumber.trim() ||
    /^\d{16}$/.test(form.cardNumber.replace(/[\s-]/g, ""));
  const ready =
    !!form.recipientName.trim() &&
    !!(form.cardNumber.trim() || form.paymeUrl.trim()) &&
    !!form.paymentInstructions.trim() &&
    !!form.reviewHours.trim() &&
    activePackages > 0 &&
    paymeValid &&
    cardValid;
  function field(
    name: keyof CommerceSettings,
    label: string,
    placeholder: string,
    multiline = false,
  ) {
    return (
      <div className="commerce-field">
        <label htmlFor={`settings-${name}`}>{label}</label>
        {multiline ? (
          <textarea
            id={`settings-${name}`}
            value={String(form[name])}
            placeholder={placeholder}
            onChange={(event) =>
              setForm({ ...form, [name]: event.target.value })
            }
          />
        ) : (
          <input
            id={`settings-${name}`}
            type={name === "paymeUrl" ? "url" : "text"}
            value={String(form[name])}
            placeholder={placeholder}
            onChange={(event) =>
              setForm({ ...form, [name]: event.target.value })
            }
          />
        )}
      </div>
    );
  }
  return (
    <AdminLayout
      title="To‘lov va namuna dars sozlamalari"
      subtitle="Rekvizitlar tasdiqlangach to‘lov qabul qilishni yoqing"
    >
      <div className="admin-commerce">
        {settings.isLoading ? (
          <Busy />
        ) : settings.isError ? (
          <QueryError error={settings.error} retry={() => settings.refetch()} />
        ) : (
          <form
            className="commerce-panel commerce-fields"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.paymentsEnabled || ready) mutation.mutate();
            }}
          >
            <h2>Coin va dars narxlari</h2>
            <p>
              Bonus faqat yangi tasdiqlangan o‘quvchiga bir marta beriladi.
              Avvalgi xaridlar saqlanadi.
            </p>
            <div className="commerce-grid">
              {(
                [
                  ["welcomeCoins", "Ro‘yxatdan o‘tish bonusi"],
                  ["lessonCost", "Odatiy dars narxi"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    required
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <details>
              <summary>Alohida dars narxlari</summary>
              {lessons.data?.map((lesson) => (
                <label key={lesson.id} className="commerce-field">
                  {lesson.title}
                  <input
                    aria-label={`${lesson.title} narxi`}
                    type="number"
                    min={1}
                    max={100000}
                    placeholder={String(form.lessonCost)}
                    value={form.lessonPrices[String(lesson.id)] ?? ""}
                    onChange={(e) => {
                      const prices = { ...form.lessonPrices };
                      if (!e.target.value) delete prices[String(lesson.id)];
                      else prices[String(lesson.id)] = Number(e.target.value);
                      setForm({ ...form, lessonPrices: prices });
                    }}
                  />
                </label>
              ))}
            </details>
            <h2>O‘quvchi to‘lov sahifasi</h2>
            <div className="commerce-grid">
              {field(
                "recipientName",
                "To‘lov qabul qiluvchining nomi",
                "Bankdagi ism yoki tashkilot nomi",
              )}
              {field(
                "cardNumber",
                "Karta raqami",
                "Tasdiqlangan to‘lov kartasi",
              )}
              {field(
                "paymeUrl",
                "Rasmiy Payme havolasi (ixtiyoriy)",
                "https://…",
              )}
              {field(
                "reviewHours",
                "Tekshirish ish vaqti",
                "Masalan: 09:00–18:00, Toshkent vaqti",
              )}
            </div>
            {field(
              "paymentInstructions",
              "To‘lov yo‘riqnomasi",
              "Summa, buyurtma raqami va chek yuborish tartibi",
              true,
            )}
            <div className="commerce-field">
              <label htmlFor="demo-lesson">
                Ro‘yxatsiz ochiladigan namuna dars
              </label>
              <select
                id="demo-lesson"
                value={form.demoLessonId ?? ""}
                disabled={lessons.isLoading || lessons.isError}
                onChange={(event) =>
                  setForm({
                    ...form,
                    demoLessonId: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              >
                <option value="">Hali tanlanmagan</option>
                {lessons.data
                  ?.filter(
                    (lesson) =>
                      lesson.status !== "archived" && !!publishedLesson(lesson),
                  )
                  .map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.title}
                    </option>
                  ))}
              </select>
              {lessons.isError && (
                <p role="alert" className="commerce-muted">
                  Darslar ro‘yxati yuklanmadi. Namuna darsni saqlashdan oldin
                  sahifani qayta yuklang.
                </p>
              )}
              <p className="commerce-muted">
                Faqat nashr qilingan darsni tanlang. Bu dars mehmon uchun coin
                talab qilmaydi.
              </p>
            </div>
            <label className="commerce-check">
              <input
                type="checkbox"
                checked={form.paymentsEnabled}
                onChange={(event) =>
                  setForm({ ...form, paymentsEnabled: event.target.checked })
                }
              />
              Coin paketlari uchun to‘lov qabul qilishni yoqish
            </label>
            {!ready && (
              <div className="commerce-notice">
                To‘lovni yoqish uchun qabul qiluvchi, karta yoki rasmiy havola,
                yo‘riqnoma, tekshirish vaqti va narxi belgilangan faol paket
                kerak.{" "}
                {packages.isError
                  ? "Paketlar yuklanmadi."
                  : `${activePackages} ta tayyor paket mavjud.`}
              </div>
            )}
            {!paymeValid && (
              <p className="commerce-error">
                Rasmiy Payme havolasini kiriting: HTTPS, payme.uz yoki paycom.uz
                domeni.
              </p>
            )}
            {!cardValid && (
              <p className="commerce-error">
                Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.
              </p>
            )}
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !paymeValid ||
                !cardValid ||
                (form.paymentsEnabled && !ready)
              }
            >
              {mutation.isPending && (
                <Loader2 size={16} className="animate-spin mr-2" />
              )}
              Sozlamalarni saqlash
            </Button>
          </form>
        )}
        <AdminBotPairing />
      </div>
    </AdminLayout>
  );
}

type AuditEvent = {
  id: number;
  actorId: string | null;
  userId: string | null;
  action: string;
  referenceId: string | null;
  details: unknown;
  createdAt: string;
};
const actionLabels: Record<string, string> = {
  support_created: "Murojaat yaratildi",
  support_admin_reply: "Admin murojaatga javob berdi",
  support_student_reply: "O‘quvchi murojaatga javob berdi",
  payment_approved: "To‘lov tasdiqlandi",
  payment_rejected: "To‘lov rad etildi",
  payment_needs_info: "Aniqlashtirish so‘raldi",
  payment_refund: "Qaytarish qayd etildi",
  payment_refunded: "Qaytarish qayd etildi",
  access_granted: "Darsga kirish berildi",
  access_revoked: "Darsga kirish bekor qilindi",
  coin_adjustment: "Coin balansi tuzatildi",
  lesson_access_grant: "Darsga kirish berildi",
  lesson_access_revoke: "Darsga kirish bekor qilindi",
  settings_updated: "Sozlamalar yangilandi",
  package_created: "Paket yaratildi",
  package_updated: "Paket yangilandi",
};
export function AdminCommerceAudit() {
  const query = useQuery<{ events: AuditEvent[] }>({
    queryKey: ["/api/admin/commerce/audit"],
    refetchInterval: 30000,
  });
  const [search, setSearch] = useState("");
  const events = (query.data?.events || []).filter((event) =>
    `${event.action} ${actionLabels[event.action] || ""} ${event.actorId || ""} ${event.userId || ""} ${event.referenceId || ""}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <AdminLayout
      title="Admin amallari tarixi"
      subtitle="To‘lov va kirish qarorlarining saqlangan tarixi"
    >
      <div className="admin-commerce">
        <div className="commerce-toolbar">
          <p className="commerce-muted">
            Eng so‘nggi 300 amal. Barcha amallar to‘liq tarixda saqlanadi.
          </p>
          <a
            className="commerce-link"
            href="/api/admin/commerce/export?type=audit"
          >
            To‘liq tarix CSV
          </a>
        </div>
        <div className="commerce-field">
          <label htmlFor="audit-search">
            Amal, admin yoki buyurtma bo‘yicha qidirish
          </label>
          <input
            id="audit-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {query.isLoading ? (
          <Busy />
        ) : query.isError ? (
          <QueryError error={query.error} retry={() => query.refetch()} />
        ) : (
          <div className="commerce-list">
            {events.length ? (
              events.map((event) => (
                <article className="commerce-row commerce-audit" key={event.id}>
                  <div>
                    <strong>
                      {actionLabels[event.action] || event.action}
                    </strong>
                    <p className="commerce-muted">{date(event.createdAt)}</p>
                    <p className="commerce-muted commerce-reference">
                      Admin: {event.actorId || "Tizim"} · O‘quvchi:{" "}
                      {event.userId || "—"}
                    </p>
                    {event.referenceId && (
                      <p className="commerce-muted commerce-reference">
                        Buyurtma / ma’lumot: {event.referenceId}
                      </p>
                    )}
                  </div>
                  <details>
                    <summary>Tafsilotlar</summary>
                    <pre>{JSON.stringify(event.details, null, 2)}</pre>
                  </details>
                </article>
              ))
            ) : (
              <div className="commerce-panel commerce-empty">
                Mos amallar topilmadi.
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

type AdminWallet = WalletDTO & {
  access: {
    id: number;
    lessonId: number;
    source: string;
    priceCoins: number;
    revokedAt: string | null;
    createdAt: string;
    title: string;
  }[];
};
export function AdminUserCommercePanel({ userId }: { userId: string }) {
  const wallet = useQuery<AdminWallet>({
    queryKey: [`/api/admin/commerce/users/${userId}/wallet`],
  });
  const lessons = useQuery<Lesson[]>({
    queryKey: ["/api/admin/lessons"],
  });
  const [lessonId, setLessonId] = useState("");
  const [grant, setGrant] = useState(true);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const { toast } = useToast();
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
    setConfirmed(false);
  }, [userId, lessonId, grant, reason]);
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", `/api/admin/commerce/users/${userId}/access`, {
          lessonId: Number(lessonId),
          grant,
          reason: reason.trim(),
          idempotencyKey,
        })
      ).json(),
    onSuccess: () => {
      invalidateCommerce();
      setReason("");
      setConfirmed(false);
      setIdempotencyKey(crypto.randomUUID());
      toast({
        title: grant ? "Darsga kirish berildi" : "Darsga kirish bekor qilindi",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Kirish huquqi o‘zgarmadi",
        description: error.message,
        variant: "destructive",
      }),
  });
  const valid =
    Number.isInteger(Number(lessonId)) &&
    Number(lessonId) > 0 &&
    reason.trim().length >= 3 &&
    confirmed;
  const sources: Record<string, string> = {
    purchase: "Coin bilan xarid",
    legacy: "Avvalgi o‘quvchi",
    admin: "Admin bergan",
    admin_grant: "Admin bergan",
  };
  return (
    <div className="admin-commerce">
      {wallet.isLoading ? (
        <Busy />
      ) : wallet.isError ? (
        <QueryError error={wallet.error} retry={() => wallet.refetch()} />
      ) : (
        wallet.data && (
          <>
            <Panel title="Hamyon va dars huquqlari">
              <p className="commerce-muted mb-4">
                Joriy balans: <strong>{wallet.data.balance} coin</strong> ·
                Ro‘yxatdan o‘tish bonusi:{" "}
                {wallet.data.bonusGranted ? "berilgan" : "berilmagan"}
              </p>
              <div className="commerce-list">
                {wallet.data.access.length ? (
                  wallet.data.access.map((access) => (
                    <div className="commerce-row" key={access.id}>
                      <div>
                        <strong>{access.title}</strong>
                        <p className="commerce-muted">
                          {sources[access.source] || access.source} ·{" "}
                          {access.priceCoins} coin · {date(access.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`commerce-tag ${access.revokedAt ? "cancelled" : "active"}`}
                      >
                        {access.revokedAt ? "Bekor qilingan" : "Ochiq"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="commerce-empty">Olingan darslar yo‘q.</p>
                )}
              </div>
            </Panel>
            <Panel title="Darsga kirishni boshqarish">
              <p className="commerce-muted mb-4">
                Yordam, avvalgi xarid yoki qaytarish uchun ishlating. Bu amal
                coin yechmaydi; sabab va admin qarori tarixda saqlanadi.
              </p>
              <form
                className="commerce-fields"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (valid) mutation.mutate();
                }}
              >
                <div className="commerce-field">
                  <label htmlFor="user-access-lesson">Dars</label>
                  <select
                    id="user-access-lesson"
                    value={lessonId}
                    onChange={(event) => {
                      setLessonId(event.target.value);
                      setConfirmed(false);
                      setIdempotencyKey(crypto.randomUUID());
                    }}
                    disabled={lessons.isLoading || lessons.isError}
                  >
                    <option value="">Darsni tanlang</option>
                    {lessons.data?.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="commerce-field">
                  <label htmlFor="user-access-operation">Amal</label>
                  <select
                    id="user-access-operation"
                    value={grant ? "grant" : "revoke"}
                    onChange={(event) => {
                      setGrant(event.target.value === "grant");
                      setConfirmed(false);
                      setIdempotencyKey(crypto.randomUUID());
                    }}
                  >
                    <option value="grant">Kirish berish</option>
                    <option value="revoke">Kirishni bekor qilish</option>
                  </select>
                </div>
                <div className="commerce-field">
                  <label htmlFor="user-access-reason">Sabab</label>
                  <textarea
                    id="user-access-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    minLength={3}
                    required
                  />
                </div>
                <label className="commerce-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  O‘quvchi, dars va kirish o‘zgarishining sababini tekshirdim.
                </label>
                <Button type="submit" disabled={!valid || mutation.isPending}>
                  {mutation.isPending && (
                    <Loader2 size={16} className="animate-spin mr-2" />
                  )}
                  {grant
                    ? "Darsga kirish berish"
                    : "Darsga kirishni bekor qilish"}
                </Button>
              </form>
            </Panel>
            <Panel title="Coin harakatlari">
              <div className="commerce-list">
                {wallet.data.transactions.length ? (
                  wallet.data.transactions.map((transaction) => (
                    <div className="commerce-row" key={transaction.id}>
                      <div>
                        <strong>
                          {transaction.description || transaction.type}
                        </strong>
                        <p className="commerce-muted">
                          {date(transaction.createdAt)}
                        </p>
                        <p className="commerce-muted">
                          Balans: {transaction.balanceBefore ?? "—"} →{" "}
                          {transaction.balanceAfter ?? "—"}
                        </p>
                      </div>
                      <strong
                        className={
                          transaction.amount > 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }
                      >
                        {transaction.amount > 0 ? "+" : ""}
                        {transaction.amount} coin
                      </strong>
                    </div>
                  ))
                ) : (
                  <p className="commerce-empty">Harakatlar yo‘q.</p>
                )}
              </div>
            </Panel>
          </>
        )
      )}
    </div>
  );
}

type SupportTicket = SupportTicketDTO;
type SupportThread = SupportThreadDTO;
const supportCategories = {
  payment: "To‘lov",
  lesson: "Dars",
  refund: "Qaytarish",
  other: "Boshqa",
};
const supportStatuses = {
  open: "Javob kutilmoqda",
  answered: "Javob berilgan",
  closed: "Yopilgan",
};

export function AdminSupportPage() {
  const query = useQuery<{ tickets: SupportTicket[] }>({
    queryKey: ["/api/admin/commerce/support"],
    refetchInterval: 20000,
  });
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const tickets = (query.data?.tickets || []).filter(
    (ticket) =>
      (status === "all" || ticket.status === status) &&
      `${ticket.subject} ${ticket.fullName || ""} ${ticket.userId || ""} ${ticket.orderId || ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <AdminLayout
      title="O‘quvchilar murojaatlari"
      subtitle="To‘lov, dars va qaytarish bo‘yicha savollarni kuzating"
    >
      <div className="admin-commerce">
        <div className="commerce-grid">
          <div className="commerce-field">
            <label htmlFor="support-search">
              O‘quvchi, mavzu yoki buyurtma bo‘yicha qidirish
            </label>
            <input
              id="support-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="commerce-field">
            <label htmlFor="support-status">Murojaat holati</label>
            <select
              id="support-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">Barcha murojaatlar</option>
              {Object.entries(supportStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {query.isLoading ? (
          <Busy />
        ) : query.isError ? (
          <QueryError error={query.error} retry={() => query.refetch()} />
        ) : (
          <div className="commerce-list">
            {tickets.length ? (
              tickets.map((ticket) => (
                <article className="commerce-row" key={ticket.id}>
                  <div>
                    <strong>{ticket.subject}</strong>
                    <p className="commerce-muted">
                      {ticket.fullName || ticket.userId || "O‘quvchi"} ·{" "}
                      {supportCategories[ticket.category]} ·{" "}
                      {date(ticket.updatedAt)}
                    </p>
                    <p className="commerce-muted commerce-reference">
                      #{ticket.id}
                    </p>
                  </div>
                  <div className="commerce-actions">
                    <span
                      className={`commerce-tag ${ticket.status === "open" ? "needs_info" : ticket.status === "answered" ? "approved" : ""}`}
                    >
                      {supportStatuses[ticket.status]}
                    </span>
                    <Link
                      href={`/admin/support/${ticket.id}`}
                      className="commerce-link"
                    >
                      Murojaatni ochish <ArrowRight size={16} />
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <div className="commerce-panel commerce-empty">
                Bu holatda murojaat yo‘q.
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export function AdminSupportTicketPage() {
  const [, params] = useRoute("/admin/support/:id");
  const query = useQuery<SupportThread>({
    queryKey: [`/api/admin/commerce/support/${params?.id}`],
    enabled: !!params?.id,
    refetchInterval: 15000,
  });
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SupportTicket["status"]>("answered");
  useEffect(() => {
    setMessage("");
    setStatus("answered");
  }, [params?.id]);
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest(
          "POST",
          `/api/admin/commerce/support/${params?.id}/reply`,
          { message: message.trim(), status },
        )
      ).json() as Promise<SupportThread>,
    onSuccess: (result) => {
      queryClient.setQueryData(
        [`/api/admin/commerce/support/${params?.id}`],
        result,
      );
      invalidateCommerce();
      setMessage("");
      toast({
        title: "Javob saqlandi",
        description: "O‘quvchi javobni shaxsiy kabinetida ko‘radi.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Javob yuborilmadi",
        description: error.message,
        variant: "destructive",
      }),
  });
  const ticket = query.data?.ticket;
  return (
    <AdminLayout
      title="Murojaat tafsilotlari"
      subtitle="O‘quvchi bilan yozishmalar va qarorlar"
    >
      <div className="admin-commerce">
        <Link href="/admin/support" className="commerce-link">
          <ArrowLeft size={17} />
          Barcha murojaatlar
        </Link>
        {query.isLoading ? (
          <Busy />
        ) : query.isError ? (
          <QueryError error={query.error} retry={() => query.refetch()} />
        ) : (
          ticket && (
            <>
              <Panel title={ticket.subject}>
                <div className="commerce-toolbar mb-4">
                  <p className="commerce-muted">
                    {supportCategories[ticket.category]} ·{" "}
                    {supportStatuses[ticket.status]}
                  </p>
                  <p className="commerce-muted">
                    Yangilangan: {date(ticket.updatedAt)}
                  </p>
                </div>
                <dl className="commerce-details">
                  <div>
                    <dt>O‘quvchi</dt>
                    <dd>{ticket.fullName || ticket.userId || "—"}</dd>
                  </div>
                  <div>
                    <dt>Yaratilgan</dt>
                    <dd>{date(ticket.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Murojaat raqami</dt>
                    <dd>#{ticket.id}</dd>
                  </div>
                  {ticket.lessonId && (
                    <div>
                      <dt>Dars raqami</dt>
                      <dd>{ticket.lessonId}</dd>
                    </div>
                  )}
                </dl>
                {ticket.orderId && (
                  <Link
                    href={`/admin/payments/${ticket.orderId}`}
                    className="commerce-link mt-4"
                  >
                    Tegishli to‘lov buyurtmasini ochish <ArrowRight size={16} />
                  </Link>
                )}
                {ticket.lessonId && (
                  <Link
                    href={`/admin/lessons/${ticket.lessonId}`}
                    className="commerce-link mt-4"
                  >
                    Tegishli darsni ochish <ArrowRight size={16} />
                  </Link>
                )}
              </Panel>
              {ticket.category === "refund" && (
                <div className="commerce-notice">
                  Murojaatga javob berish pul yoki coinni qaytarmaydi. Pulni
                  qaytarish amalga oshirilgach, uni tegishli to‘lov buyurtmasida
                  tranzaksiya raqami bilan qayd eting.
                </div>
              )}
              <Panel title="Yozishmalar">
                <div className="commerce-list">
                  {query.data?.messages.map((item) => (
                    <article
                      className={`commerce-support-message ${item.authorRole}`}
                      key={item.id}
                    >
                      <div className="commerce-toolbar">
                        <strong>
                          {item.authorName}{" "}
                          <span className="commerce-muted">
                            {item.authorRole === "admin"
                              ? "· Admin"
                              : "· O‘quvchi"}
                          </span>
                        </strong>
                        <time
                          className="commerce-muted"
                          dateTime={item.createdAt}
                        >
                          {date(item.createdAt)}
                        </time>
                      </div>
                      <p>{item.message}</p>
                    </article>
                  ))}
                </div>
              </Panel>
              <Panel
                title={
                  ticket.status === "closed"
                    ? "Murojaatni qayta ochish yoki javob berish"
                    : "O‘quvchiga javob"
                }
              >
                <form
                  className="commerce-fields"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (
                      message.trim().length >= 3 &&
                      message.trim().length <= 4000
                    )
                      mutation.mutate();
                  }}
                >
                  <div className="commerce-field">
                    <label htmlFor="support-reply-message">Javob matni</label>
                    <textarea
                      id="support-reply-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      required
                      minLength={3}
                      maxLength={4000}
                      disabled={mutation.isPending}
                    />
                  </div>
                  <div className="commerce-field">
                    <label htmlFor="support-reply-status">
                      Javobdan keyingi holat
                    </label>
                    <select
                      id="support-reply-status"
                      value={status}
                      onChange={(event) =>
                        setStatus(event.target.value as SupportTicket["status"])
                      }
                      disabled={mutation.isPending}
                    >
                      <option value="answered">
                        Javob berilgan — o‘quvchi javobini kutish
                      </option>
                      <option value="open">
                        Javob kutilmoqda — tekshiruv davom etadi
                      </option>
                      <option value="closed">
                        Yopilgan — masala yakunlandi
                      </option>
                    </select>
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      mutation.isPending ||
                      message.trim().length < 3 ||
                      message.trim().length > 4000
                    }
                  >
                    {mutation.isPending && (
                      <Loader2 size={16} className="animate-spin mr-2" />
                    )}
                    Javobni saqlash
                  </Button>
                </form>
              </Panel>
            </>
          )
        )}
      </div>
    </AdminLayout>
  );
}
