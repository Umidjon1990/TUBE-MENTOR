import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Coins,
  Copy,
  ExternalLink,
  FileImage,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LearningShell,
  Panel,
  Loading,
  ErrorState,
  EmptyState,
} from "@/components/learning-shell";
import { useAuth } from "@/hooks/use-auth";
import { errorText } from "@/lib/learning-api";
import {
  commerceRequest,
  useWallet,
  useCommerceConfig,
  walletKey,
  safeReturnTo,
  returnQuery,
} from "@/components/commerce-wallet";
import type { LessonCard } from "./learner-pages";
import type { PaymentOrderDTO } from "@shared/commerce";
import "@/learning-commerce.css";
export { SupportPage, SupportTicketPage } from "./support-pages";

type PaymentOrder = PaymentOrderDTO;
const statusLabels: Record<string, string> = {
  awaiting_payment: "To‘lov kutilmoqda",
  created: "Buyurtma yaratildi",
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
const pendingStatuses = new Set([
  "created",
  "awaiting_payment",
  "receipt_submitted",
  "under_review",
  "needs_info",
]);
const receiptStatuses = new Set([
  "awaiting_payment",
  "needs_info",
  "rejected",
  "expired",
  "cancelled",
]);
const sum = (amount: number) =>
  `${Number(amount).toLocaleString("uz-UZ")} so‘m`;
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value)).replaceAll("/", ".").replace(",", "");
function OrderStatus({ status }: { status: string }) {
  return (
    <span className={`order-status ${status}`}>
      {statusLabels[status] || status}
    </span>
  );
}
function safePaymeUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port==='443') && /(^|\.)(payme\.uz|paycom\.uz)$/.test(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}
function TelegramNotifications() {
  const cache = useQueryClient();
  const q = useQuery<{
    available: boolean;
    linked: boolean;
    botUsername: string | null;
  }>({
    queryKey: ["/api/commerce/telegram/status"],
    queryFn: () => commerceRequest("GET", "/api/commerce/telegram/status"),
  });
  const link = useMutation({
    mutationFn: () =>
      commerceRequest<{ url: string; expiresAt: string }>(
        "POST",
        "/api/commerce/telegram/link",
        {},
      ),
  });
  const unlink = useMutation({
    mutationFn: () =>
      commerceRequest("DELETE", "/api/commerce/telegram/link", {}),
    onSuccess: () => {
      link.reset();
      void cache.invalidateQueries({
        queryKey: ["/api/commerce/telegram/status"],
      });
    },
  });
  if (!q.data?.available) return null;
  const url = link.data?.url;
  const safeLink = url?.startsWith("https://t.me/") ? url : null;
  return (
    <Panel>
      <h2>Telegramda xabarnoma</h2>
      <p>
        {q.data.linked
          ? "Buyurtmangiz holati haqida botdan xabar olasiz."
          : "To‘lov holati haqida botdan xabar olish uchun Telegramni ulang."}
      </p>
      {!q.data.linked && (
        <div className="commerce-actions">
          {safeLink ? (
            <a
              href={safeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="primary-link"
            >
              Botni ochish <ExternalLink size={17} />
            </a>
          ) : (
            <Button disabled={link.isPending} onClick={() => link.mutate()}>
              {link.isPending
                ? "Tayyorlanmoqda…"
                : "Telegram xabarnomalarini ulash"}
            </Button>
          )}
          <Button variant="outline" onClick={() => q.refetch()}>
            Ulanganini tekshirish
          </Button>
        </div>
      )}
      {q.data.linked && (
        <Button
          variant="outline"
          disabled={unlink.isPending}
          onClick={() => unlink.mutate()}
        >
          {unlink.isPending ? "Uzilmoqda…" : "Bot xabarnomalarini o‘chirish"}
        </Button>
      )}
      {link.error && (
        <p className="inline-error" role="alert">
          {errorText(link.error)}
        </p>
      )}
      {unlink.error && (
        <p className="inline-error" role="alert">
          {errorText(unlink.error)}
        </p>
      )}
    </Panel>
  );
}
export function WalletPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const wallet = useWallet();
  const config = useCommerceConfig();
  const returnTo = safeReturnTo();
  const orders = useQuery<{ orders: PaymentOrder[] }>({
    queryKey: ["/api/commerce/orders", user?.id],
    queryFn: () => commerceRequest("GET", "/api/commerce/orders"),
    enabled: !!user,
    refetchInterval: (query) =>
      query.state.data?.orders.some((o) => pendingStatuses.has(o.status))
        ? 20_000
        : false,
  });
  const buy = useMutation({
    mutationFn: (packageId: number) =>
      commerceRequest<PaymentOrder>("POST", "/api/commerce/orders", {
        packageId,
      }),
    onSuccess: (order) =>
      navigate(`/payments/${order.id}${returnQuery(returnTo)}`),
  });
  return (
    <LearningShell title="Coin hamyoni" back={returnTo || "/today"}>
      <div className="commerce-page">
        {wallet.isLoading ? (
          <Loading />
        ) : wallet.error ? (
          <ErrorState error={wallet.error} retry={() => wallet.refetch()} />
        ) : (
          wallet.data && (
            <Panel className="commerce-intro">
              <span className="eyebrow">MENING BALANSIM</span>
              <strong className="wallet-balance">
                {wallet.data.balance} coin
              </strong>
              <p>
                Coin bilan dars ochasiz. Ochilgan darsni qayta ko‘rish uchun
                coin olinmaydi.
              </p>
              {wallet.data.bonusGranted && (
                <p className="commerce-notice commerce-success">
                  Ro‘yxatdan o‘tish bonusi hisobingizga berilgan.
                </p>
              )}
              <div className="commerce-actions">
                <Link href="/my-lessons" className="outline-link">
                  <BookOpen size={18} /> Mening darslarim
                </Link>
                <Link href="/support" className="outline-link">
                  Yordam va murojaatlar
                </Link>
                {returnTo && (
                  <Link href={returnTo} className="primary-link">
                    Tanlagan darsimga qaytish <ArrowRight size={18} />
                  </Link>
                )}
              </div>
            </Panel>
          )
        )}
        <section>
          <h2 className="section-title">Coin paketlari</h2>
          <p>
            Kerakli paketni tanlang, to‘lov qiling va chekni saytda yuboring.
            Admin tasdiqlagach coin qo‘shiladi.
          </p>
          {config.isLoading ? (
            <Loading />
          ) : config.error ? (
            <ErrorState error={config.error} retry={() => config.refetch()} />
          ) : !config.data?.paymentsEnabled ||
            !config.data.packages.some((p) => p.isActive && p.priceUzs > 0) ? (
            <p className="commerce-notice" role="status">
              Coin xaridi hozircha ochilmagan. Balansingizdagi coinlardan va
              oldin ochilgan darslaringizdan foydalanishingiz mumkin.
            </p>
          ) : (
            <div className="package-grid">
              {config.data.packages
                .filter((p) => p.isActive && p.priceUzs > 0)
                .map((p) => (
                  <article className="coin-package" key={p.id}>
                    <h3>{p.name}</h3>
                    <strong>
                      <Coins
                        size={22}
                        style={{ display: "inline", marginRight: 6 }}
                      />
                      {p.coins} coin
                    </strong>
                    <small>
                      {Math.floor(p.coins / config.data!.lessonCost)} ta dars
                      ochishga yetadi
                    </small>
                    <strong className="package-price">{sum(p.priceUzs)}</strong>
                    <Button
                      disabled={buy.isPending}
                      onClick={() => buy.mutate(p.id)}
                    >
                      {buy.isPending && buy.variables === p.id
                        ? "Buyurtma yaratilmoqda…"
                        : `${p.name} — tanlash`}
                    </Button>
                  </article>
                ))}
            </div>
          )}
          {buy.error && (
            <p role="alert" className="inline-error">
              {errorText(buy.error)}
            </p>
          )}
        </section>
        <Panel>
          <h2>Buyurtmalarim</h2>
          {orders.isLoading ? (
            <Loading />
          ) : orders.error ? (
            <ErrorState error={orders.error} retry={() => orders.refetch()} />
          ) : orders.data?.orders.length ? (
            <div className="commerce-history">
              {orders.data.orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/payments/${o.id}${returnQuery(returnTo)}`}
                  className="commerce-history-row"
                >
                  <div>
                    <strong>
                      {o.packageName} · {o.coins} coin
                    </strong>
                    <small>
                      {sum(o.priceUzs)} · {date(o.createdAt)}
                    </small>
                    <OrderStatus status={o.status} />
                  </div>
                  <ArrowRight size={20} />
                </Link>
              ))}
            </div>
          ) : (
            <p>Hali coin xarid qilmagansiz.</p>
          )}
        </Panel>
        <Panel>
          <h2>Coin harakatlari</h2>
          {!wallet.data?.transactions.length ? (
            <p>Coin harakatlari shu yerda ko‘rinadi.</p>
          ) : (
            <div className="commerce-history">
              {wallet.data.transactions.map((t) => (
                <div className="commerce-history-row" key={t.id}>
                  <div>
                    <strong>
                      {t.description ||
                        (t.amount > 0 ? "Coin qo‘shildi" : "Dars ochildi")}
                    </strong>
                    <small>
                      {date(t.createdAt)}
                      {t.balanceBefore !== null && t.balanceAfter !== null
                        ? ` · Balans: ${t.balanceBefore} → ${t.balanceAfter} coin`
                        : ""}
                    </small>
                  </div>
                  <strong
                    className={`coin-delta ${t.amount < 0 ? "negative" : ""}`}
                  >
                    {t.amount > 0 ? "+" : ""}
                    {t.amount}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <TelegramNotifications />
      </div>
    </LearningShell>
  );
}
export function PaymentOrderPage() {
  const { id } = useParams<{ id: string }>();
  const cache = useQueryClient();
  const wallet = useWallet();
  const returnTo = safeReturnTo();
  const orderKey = ["commerce-order", id];
  const q = useQuery<PaymentOrder>({
    queryKey: orderKey,
    queryFn: () => commerceRequest("GET", `/api/commerce/orders/${id}`),
    refetchInterval: (query) =>
      query.state.data && pendingStatuses.has(query.state.data.status)
        ? 15_000
        : false,
    retry: false,
  });
  const payme = useMutation({mutationFn:()=>commerceRequest<{checkoutUrl:string}>('POST',`/api/commerce/orders/${id}/payme`,{}),onSuccess:result=>{const url=safePaymeUrl(result.checkoutUrl);if(url)window.location.assign(url);void q.refetch();}});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [uploadVersion, setUploadVersion] = useState(0);
  const receipt = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append("file", file!);
      return commerceRequest<{ duplicateWarning: boolean; status?: string }>(
        "POST",
        `/api/commerce/orders/${id}/receipt`,
        body,
      );
    },
    onSuccess: (result) => {
      setFile(null);
      setUploadVersion((n) => n + 1);
      setNotice(
        result.status === "expired"
          ? "Chek yuborildi. Muddati o‘tgan buyurtmani admin alohida tekshiradi."
          : result.duplicateWarning
            ? "Chek yuborildi. Ushbu chek avval ham yuborilgan: admin tekshiradi."
            : "Chek yuborildi. Admin to‘lovni tekshirmoqda.",
      );
      void cache.invalidateQueries({ queryKey: orderKey });
      void cache.invalidateQueries({ queryKey: ["/api/commerce/orders"] });
    },
  });
  const cancel = useMutation({
    mutationFn: () =>
      commerceRequest("POST", `/api/commerce/orders/${id}/cancel`, {}),
    onSuccess: () => {
      setCancelConfirm(false);
      setNotice("Buyurtma bekor qilindi.");
      void cache.invalidateQueries({ queryKey: orderKey });
      void cache.invalidateQueries({ queryKey: ["/api/commerce/orders"] });
    },
  });
  useEffect(() => {
    if (
      q.data?.status === "approved" ||
      q.data?.status === "refunded" ||
      q.data?.status === "partially_refunded"
    )
      void cache.invalidateQueries({ queryKey: walletKey });
  }, [q.data?.status, cache]);
  useEffect(() => {
    setFile(null);
    setFileError("");
    setNotice("");
    setCancelConfirm(false);
  }, [id]);
  const order = q.data;
  const uploadAllowed = !!order && order.paymentProvider!=='payme' && receiptStatuses.has(order.status);
  const expired =
    !!order &&
    (order.status === "expired" ||
      order.status === "cancelled" ||
      new Date(order.expiresAt).getTime() <= Date.now());
  const paymeUrl = safePaymeUrl(order?.instructions?.paymeUrl);
  async function copyCard() {
    if (!order?.instructions.cardNumber) return;
    try {
      await navigator.clipboard.writeText(order.instructions.cardNumber);
      setNotice("Karta raqami nusxalandi.");
    } catch {
      setNotice("Karta raqamini belgilab, nusxalang.");
    }
  }
  return (
    <LearningShell
      title="To‘lov buyurtmasi"
      back={`/wallet${returnQuery(returnTo)}`}
    >
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        order && (
          <div className="commerce-page">
            <Panel>
              <div className="section-heading">
                <h2>{order.packageName}</h2>
                <OrderStatus status={order.status} />
              </div>
              <strong className="wallet-balance">{order.coins} coin</strong>
              <dl className="commerce-details">
                <div>
                  <dt>To‘lov summasi</dt>
                  <dd>{sum(order.priceUzs)}</dd>
                </div>
                <div>
                  <dt>Buyurtma raqami</dt>
                  <dd>{order.id}</dd>
                </div>
                <div>
                  <dt>Yaratilgan</dt>
                  <dd>{date(order.createdAt)}</dd>
                </div>
                {receiptStatuses.has(order.status) && (
                  <div>
                    <dt>To‘lov muddati</dt>
                    <dd>{date(order.expiresAt)}</dd>
                  </div>
                )}
              </dl>
              {order.reason && (
                <p className="commerce-notice" role="status">
                  {order.reason}
                </p>
              )}
              {order.status === "approved" && (
                <div className="commerce-notice commerce-success" role="status">
                  <ShieldCheck size={24} />
                  <strong>
                    {" "}
                    To‘lov tasdiqlandi. {order.coins} coin hisobingizga
                    qo‘shildi.
                  </strong>
                  <p>
                    {wallet.data
                      ? `Hozirgi balans: ${wallet.data.balance} coin.`
                      : "Balans yangilanmoqda…"}
                  </p>
                  <Link href={returnTo || "/courses"} className="primary-link">
                    {returnTo ? "Tanlagan darsimni ochish" : "Dars tanlash"}{" "}
                    <ArrowRight size={18} />
                  </Link>
                </div>
              )}
              {(order.status === "receipt_submitted" ||
                order.status === "under_review") && (
                <p className="commerce-notice" role="status">
                  Chek qabul qilindi. Admin pul tushumini tekshirgach
                  balansingiz yangilanadi.
                  {order.instructions?.reviewHours
                    ? ` Tekshirish vaqti: ${order.instructions.reviewHours}.`
                    : ""}
                </p>
              )}
              {(order.status === "expired" || order.status === "cancelled") && (
                <p className="commerce-notice">
                  Bu buyurtma bo‘yicha yangi to‘lov qilmang. Pulni oldin
                  o‘tkazgan bo‘lsangiz, kechikkan to‘lov chekini yuboring yoki
                  buyurtma raqami bilan yordam xizmatiga murojaat qiling.
                </p>
              )}
              {(order.status === "refunded" ||
                order.status === "partially_refunded") && (
                <p className="commerce-notice">
                  To‘lov bo‘yicha qaytarish qayd etildi: {order.refundedCoins}{" "}
                  coin. Tafsilotlarni coin tarixidan ko‘rishingiz mumkin.
                </p>
              )}
              {notice && (
                <p role="status" className="success-text">
                  {notice}
                </p>
              )}
            </Panel>
            {order.status==='awaiting_payment'&&!expired&&order.paymeAvailable&&<Panel><h2>Payme orqali to‘lash</h2><p>To‘lov tasdiqlangach {order.coins} coin avtomatik qo‘shiladi. Chek yuborish shart emas.</p><Button disabled={payme.isPending} onClick={()=>payme.mutate()}>{payme.isPending?'Payme ochilmoqda…':'Payme orqali to‘lash'}</Button>{payme.error&&<p role="alert">{errorText(payme.error)}</p>}</Panel>}
            {uploadAllowed && (
              <>
                {!expired && (
                  <Panel>
                    <h2>1. To‘lov qiling</h2>
                    <p>
                      Aynan {sum(order.priceUzs)} to‘lang. To‘lovdan keyin chek
                      rasmini shu buyurtmaga yuboring.
                    </p>
                    {order.instructions?.recipientName && (
                      <p>
                        Qabul qiluvchi:{" "}
                        <strong>{order.instructions.recipientName}</strong>
                      </p>
                    )}
                    {order.instructions?.cardNumber && (
                      <>
                        <strong className="payment-card-number">
                          {order.instructions.cardNumber}
                        </strong>
                        <div className="commerce-actions">
                          <Button variant="outline" onClick={copyCard}>
                            <Copy size={18} /> Karta raqamini nusxalash
                          </Button>
                        </div>
                      </>
                    )}
                    {paymeUrl && (
                      <div className="commerce-actions">
                        <a
                          className="primary-link"
                          href={paymeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Payme orqali to‘lash <ExternalLink size={18} />
                        </a>
                      </div>
                    )}
                    {order.instructions?.paymentInstructions && (
                      <p
                        className="commerce-notice"
                        style={{ whiteSpace: "pre-line" }}
                      >
                        {order.instructions.paymentInstructions}
                      </p>
                    )}
                  </Panel>
                )}
                <Panel>
                  <h2>
                    {expired
                      ? "Kechikkan to‘lov cheki"
                      : order.status === "needs_info" ||
                          order.status === "rejected"
                        ? "2. Chekni qayta yuboring"
                        : "2. Chekni yuboring"}
                  </h2>
                  {expired && (
                    <p className="commerce-notice">
                      Oldin amalga oshirgan to‘lovingiz chekini yuboring. Admin
                      uni alohida tekshiradi; coin tekshiruv yakunlangach
                      qo‘shilishi mumkin.
                    </p>
                  )}
                  <form
                    className="receipt-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (file && !fileError && !receipt.isPending)
                        receipt.mutate();
                    }}
                  >
                    <label>
                      Chek rasmi
                      <input
                        key={`${id}:${uploadVersion}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={receipt.isPending}
                        onChange={(e) => {
                          const selected = e.target.files?.[0] || null;
                          setFileError("");
                          setNotice("");
                          receipt.reset();
                          if (
                            selected &&
                            (![
                              "image/jpeg",
                              "image/png",
                              "image/webp",
                            ].includes(selected.type) ||
                              selected.size > 5 * 1024 * 1024)
                          ) {
                            setFile(null);
                            setFileError(
                              "JPG, PNG yoki WEBP rasm tanlang. Hajmi 5 MBdan oshmasin.",
                            );
                          } else setFile(selected);
                        }}
                      />
                    </label>
                    <small>
                      JPG, PNG yoki WEBP · 5 MBgacha. Summa, sana va tranzaksiya
                      raqami ko‘rinsin.
                    </small>
                    {file && (
                      <p>
                        <FileImage size={18} style={{ display: "inline" }} />{" "}
                        {file.name}
                      </p>
                    )}
                    <Button
                      type="submit"
                      disabled={!file || !!fileError || receipt.isPending}
                    >
                      <Upload size={18} />
                      {receipt.isPending
                        ? "Chek yuborilmoqda…"
                        : "Chekni yuborish"}
                    </Button>
                    {(fileError || receipt.error) && (
                      <p role="alert" className="inline-error">
                        {fileError || errorText(receipt.error)}
                      </p>
                    )}
                  </form>
                </Panel>
              </>
            )}
            {!!order.receipts?.length && (
              <Panel>
                <h2>Yuborilgan cheklar</h2>
                <div className="receipt-list">
                  {order.receipts.map((r) => (
                    <div className="receipt-card" key={r.id}>
                      <img
                        src={r.url}
                        alt="Yuborilgan to‘lov cheki"
                        loading="lazy"
                      />
                      <a href={r.url} target="_blank" rel="noopener noreferrer">
                        <FileImage size={18} />
                        {r.originalName}
                      </a>
                      <small>{date(r.createdAt)}</small>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
            {order.status === "awaiting_payment" && order.paymentProvider!=='payme' && (
              <Panel>
                <h2>Buyurtmani bekor qilish</h2>
                <p>
                  To‘lov qilmagan bo‘lsangiz, buyurtmani bekor qilishingiz
                  mumkin.
                </p>
                {cancelConfirm ? (
                  <>
                    <p className="commerce-notice">
                      Bu buyurtmani bekor qilasizmi?
                    </p>
                    <div className="commerce-actions">
                      <Button
                        variant="destructive"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate()}
                      >
                        {cancel.isPending
                          ? "Bekor qilinmoqda…"
                          : "Ha, bekor qilish"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={cancel.isPending}
                        onClick={() => setCancelConfirm(false)}
                      >
                        Orqaga
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setCancelConfirm(true)}
                  >
                    Buyurtmani bekor qilish
                  </Button>
                )}
                {cancel.error && (
                  <p role="alert" className="inline-error">
                    {errorText(cancel.error)}
                  </p>
                )}
              </Panel>
            )}
            <div className="commerce-actions">
              <Link
                className="outline-link"
                href={`/wallet${returnQuery(returnTo)}`}
              >
                Hamyonimga qaytish
              </Link>
              <Button
                variant="outline"
                disabled={q.isFetching}
                onClick={() => q.refetch()}
              >
                Holatni yangilash
              </Button>
            </div>
            <TelegramNotifications />
            <div className="commerce-actions">
              <Link
                className="outline-link"
                href={`/support?${new URLSearchParams({ orderId: order.id, category: "payment" })}`}
              >
                To‘lov bo‘yicha yordam
              </Link>
              <Link
                className="outline-link"
                href={`/support?${new URLSearchParams({ orderId: order.id, category: "refund" })}`}
              >
                Qaytarish bo‘yicha murojaat
              </Link>
            </div>
          </div>
        )
      )}
    </LearningShell>
  );
}
export function MyLessonsPage() {
  const wallet = useWallet();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const q = useQuery<{ lessons: LessonCard[]; total: number }>({
    queryKey: ["commerce-my-lessons", user?.id, page],
    queryFn: () =>
      commerceRequest("GET", `/api/learn/catalog?owned=1&page=${page}`),
    enabled: !!user,
  });
  const owned =
    q.data?.lessons.filter(
      (l) => l.access === "owned" || wallet.data?.ownedLessonIds.includes(l.id),
    ) || [];
  return (
    <LearningShell title="Mening darslarim" back="/today">
      <p>
        Coin bilan ochilgan darslaringiz. Balans tugaganda ham foydalanishda
        davom etasiz.
      </p>
      {q.isLoading || wallet.isLoading ? (
        <Loading />
      ) : q.error || wallet.error ? (
        <ErrorState
          error={q.error || wallet.error}
          retry={() => {
            void q.refetch();
            void wallet.refetch();
          }}
        />
      ) : owned.length ? (
        <div className="lesson-grid">
          {owned.map((l) => (
            <Link key={l.id} href={`/learn/${l.id}`} className="lesson-row">
              <div className="course-cover">
                {l.thumbnailUrl ? (
                  <img src={l.thumbnailUrl} alt="" />
                ) : (
                  <BookOpen size={28} />
                )}
              </div>
              <div>
                <span className="level-pill">{l.level}</span>
                <h3>{l.title}</h3>
                <small>
                  {l.completionPercent === 100
                    ? "Tugallangan · qayta ko‘rish"
                    : "Davom etish"}
                </small>
              </div>
              <ArrowRight size={19} />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Birinchi darsingizni tanlang"
          description="Katalogdan dars tanlab, coin bilan oching."
          href="/courses"
        />
      )}
      {!!q.data && q.data.total > 20 && (
        <div className="pagination">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Oldingi
          </Button>
          <span>
            {page} / {Math.ceil(q.data.total / 20)}
          </span>
          <Button
            variant="outline"
            disabled={page * 20 >= q.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Keyingi
          </Button>
        </div>
      )}
    </LearningShell>
  );
}
