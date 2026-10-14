import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LearningShell,
  Panel,
  Loading,
  ErrorState,
} from "@/components/learning-shell";
import { useAuth } from "@/hooks/use-auth";
import { commerceRequest } from "@/components/commerce-wallet";
import { errorText } from "@/lib/learning-api";
import type { SupportTicketDTO, SupportThreadDTO } from "@shared/commerce";
import "@/learning-commerce.css";

type Category = SupportTicketDTO["category"];
type SupportTicket = SupportTicketDTO;
const categories: Record<Category, string> = {
  payment: "To‘lov",
  lesson: "Dars",
  refund: "Qaytarish",
  other: "Boshqa savol",
};
const statuses = {
  open: "Admin javobi kutilmoqda",
  answered: "Admin javob berdi",
  closed: "Yopildi",
};
const time = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value)).replaceAll("/", ".").replace(",", "");
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function supportContext() {
  const params = new URLSearchParams(window.location.search);
  const order = params.get("orderId");
  const lesson = params.get("lessonId");
  const lessonId =
    lesson && /^[1-9]\d*$/.test(lesson) && Number.isSafeInteger(Number(lesson))
      ? Number(lesson)
      : undefined;
  const orderId = order && uuidPattern.test(order) ? order : undefined;
  const requested = params.get("category");
  const category =
    requested && Object.prototype.hasOwnProperty.call(categories, requested)
      ? (requested as Category)
      : orderId
        ? "payment"
        : lessonId
          ? "lesson"
          : "other";
  return { orderId, lessonId, category };
}
export function SupportPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const cache = useQueryClient();
  const [context, setContext] = useState(supportContext);
  const [category, setCategory] = useState<Category>(context.category);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const q = useQuery<{ tickets: SupportTicket[] }>({
    queryKey: ["commerce-support", user?.id],
    queryFn: () => commerceRequest("GET", "/api/commerce/support"),
    enabled: !!user,
  });
  const create = useMutation({
    mutationFn: () =>
      commerceRequest<{ ticket: SupportTicket }>(
        "POST",
        "/api/commerce/support",
        {
          category,
          subject: subject.trim(),
          message: message.trim(),
          ...(context.orderId ? { orderId: context.orderId } : {}),
          ...(context.lessonId ? { lessonId: context.lessonId } : {}),
        },
      ),
    onSuccess: ({ ticket }) => {
      void cache.invalidateQueries({ queryKey: ["commerce-support"] });
      navigate(`/support/${ticket.id}`);
    },
  });
  return (
    <LearningShell title="Yordam va murojaatlar" back="/profile">
      <div className="commerce-page">
        <Panel>
          <div className="section-heading">
            <h2>Yangi murojaat</h2>
            <MessageCircle size={24} />
          </div>
          <p>
            Dars, to‘lov yoki qaytarish bo‘yicha savolingizni yozing. Javobni
            shu yerda ko‘rasiz.
          </p>
          <form
            className="support-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                subject.trim().length >= 3 &&
                message.trim().length >= 3 &&
                !create.isPending
              )
                create.mutate();
            }}
          >
            <label className="field-label">
              Murojaat turi
              <select
                value={category}
                disabled={create.isPending}
                onChange={(event) =>
                  setCategory(event.target.value as Category)
                }
              >
                {Object.entries(categories).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {context.orderId && (
              <div className="commerce-notice">
                Buyurtma:{" "}
                <Link
                  href={`/payments/${context.orderId}`}
                  className="quiet-link"
                >
                  {context.orderId}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={create.isPending}
                  onClick={() =>
                    setContext((current) => ({
                      ...current,
                      orderId: undefined,
                    }))
                  }
                >
                  Buyurtmaga bog‘lamaslik
                </Button>
              </div>
            )}
            {context.lessonId && (
              <div className="commerce-notice">
                Dars:{" "}
                <Link
                  href={`/learn/${context.lessonId}`}
                  className="quiet-link"
                >
                  #{context.lessonId}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={create.isPending}
                  onClick={() =>
                    setContext((current) => ({
                      ...current,
                      lessonId: undefined,
                    }))
                  }
                >
                  Darsga bog‘lamaslik
                </Button>
              </div>
            )}
            <label className="field-label">
              Mavzu
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                minLength={3}
                maxLength={160}
                required
                disabled={create.isPending}
                placeholder="Savolingizni qisqa yozing"
              />
            </label>
            <label className="field-label">
              Xabaringiz
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                minLength={3}
                maxLength={4000}
                rows={6}
                required
                disabled={create.isPending}
                placeholder="Nima bo‘lganini va qanday yordam kerakligini tushuntiring"
              />
            </label>
            <small>{message.length} / 4000 belgi</small>
            {category === "refund" && (
              <p className="commerce-notice">
                Qaytarish so‘rovi admin tomonidan ko‘rib chiqiladi. Murojaat
                yuborilishi pul yoki coin avtomatik qaytarilishini anglatmaydi.
              </p>
            )}
            <Button
              type="submit"
              disabled={
                create.isPending ||
                subject.trim().length < 3 ||
                message.trim().length < 3
              }
            >
              <Send size={18} />
              {create.isPending ? "Yuborilmoqda…" : "Murojaatni yuborish"}
            </Button>
            {create.error && (
              <p role="alert" className="inline-error">
                {errorText(create.error)}
              </p>
            )}
          </form>
        </Panel>
        <Panel>
          <h2>Murojaatlarim</h2>
          {q.isLoading ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} retry={() => q.refetch()} />
          ) : q.data?.tickets.length ? (
            <div className="commerce-history">
              {q.data.tickets.map((ticket) => (
                <Link
                  href={`/support/${ticket.id}`}
                  key={ticket.id}
                  className="commerce-history-row"
                >
                  <div>
                    <strong>{ticket.subject}</strong>
                    <small>
                      {categories[ticket.category]} ·{" "}
                      {time(ticket.updatedAt || ticket.createdAt)}
                    </small>
                    <span className={`order-status ${ticket.status}`}>
                      {statuses[ticket.status]}
                    </span>
                  </div>
                  <ArrowRight size={19} />
                </Link>
              ))}
            </div>
          ) : (
            <p>Hali murojaat yubormagansiz.</p>
          )}
        </Panel>
      </div>
    </LearningShell>
  );
}
export function SupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [message, setMessage] = useState("");
  const key = ["commerce-support-ticket", user?.id, id];
  const q = useQuery<SupportThreadDTO>({
    queryKey: key,
    queryFn: () => commerceRequest("GET", `/api/commerce/support/${id}`),
    enabled: !!user,
    refetchInterval: (query) =>
      query.state.data && query.state.data.ticket.status !== "closed"
        ? 20_000
        : false,
    retry: false,
  });
  const reply = useMutation({
    mutationFn: () =>
      commerceRequest("POST", `/api/commerce/support/${id}/reply`, {
        message: message.trim(),
      }),
    onSuccess: () => {
      setMessage("");
      void cache.invalidateQueries({ queryKey: key });
      void cache.invalidateQueries({ queryKey: ["commerce-support"] });
    },
  });
  useEffect(() => {
    setMessage("");
    reply.reset();
  }, [id]);
  const ticket = q.data?.ticket;
  return (
    <LearningShell title="Murojaat" back="/support">
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        ticket && (
          <div className="commerce-page">
            <Panel>
              <div className="section-heading">
                <h2>{ticket.subject}</h2>
                <span className={`order-status ${ticket.status}`}>
                  {statuses[ticket.status]}
                </span>
              </div>
              <p>
                {categories[ticket.category]} · {time(ticket.createdAt)}
              </p>
              {ticket.orderId && (
                <Link
                  className="quiet-link"
                  href={`/payments/${ticket.orderId}`}
                >
                  Bog‘langan buyurtmani ko‘rish <ArrowRight size={17} />
                </Link>
              )}
              {ticket.lessonId && (
                <Link className="quiet-link" href={`/learn/${ticket.lessonId}`}>
                  Bog‘langan darsni ko‘rish <ArrowRight size={17} />
                </Link>
              )}
              {ticket.category === "refund" && (
                <p className="commerce-notice">
                  So‘rovingiz bo‘yicha admin javobini kuting. To‘lov va coin
                  qaytarilishi alohida ko‘rib chiqiladi.
                </p>
              )}
              {ticket.status === "closed" && (
                <p className="commerce-notice">
                  Murojaat yopilgan. Yangi xabar yuborsangiz, qayta ko‘rib
                  chiqish uchun ochiladi.
                </p>
              )}
            </Panel>
            <Panel>
              <h2>Xabarlar</h2>
              <div className="support-thread">
                {q.data?.messages.map((entry) => (
                  <article
                    key={entry.id}
                    className={`support-message ${entry.authorRole}`}
                  >
                    <div>
                      <strong>
                        {entry.authorRole === "admin"
                          ? entry.authorName
                          : "Siz"}
                      </strong>
                      <small>{time(entry.createdAt)}</small>
                    </div>
                    <p>{entry.message}</p>
                  </article>
                ))}
              </div>
              <form
                className="support-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (message.trim().length >= 3 && !reply.isPending)
                    reply.mutate();
                }}
              >
                <label className="field-label">
                  Javobingiz
                  <textarea
                    rows={4}
                    minLength={3}
                    maxLength={4000}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    required
                    disabled={reply.isPending}
                  />
                </label>
                <small>{message.length} / 4000 belgi</small>
                <Button
                  type="submit"
                  disabled={reply.isPending || message.trim().length < 3}
                >
                  <Send size={18} />
                  {reply.isPending ? "Yuborilmoqda…" : "Javobni yuborish"}
                </Button>
                {reply.error && (
                  <p role="alert" className="inline-error">
                    {errorText(reply.error)}
                  </p>
                )}
              </form>
              <Button
                variant="outline"
                disabled={q.isFetching}
                onClick={() => q.refetch()}
                style={{ marginTop: 16 }}
              >
                Javoblarni yangilash
              </Button>
            </Panel>
          </div>
        )
      )}
    </LearningShell>
  );
}
