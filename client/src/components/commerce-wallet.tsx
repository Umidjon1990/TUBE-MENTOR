import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Coins, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import "@/learning-commerce.css";
import type { WalletDTO } from "@shared/commerce";

export type Wallet = WalletDTO;
export interface CommerceConfig {
  welcomeCoins: number;
  lessonCost: number;
  demoLessonId: number | null;
  paymentsEnabled: boolean;
  packages: {
    id: number;
    name: string;
    coins: number;
    priceUzs: number;
    isActive: boolean;
  }[];
  telegramAvailable: boolean;
}
export class CommerceError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export async function commerceRequest<T>(
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(url, {
    method,
    signal,
    credentials: "include",
    ...(body === undefined
      ? {}
      : form
        ? { body: body as FormData }
        : {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && data?.code !== "LOGIN_REQUIRED")
      queryClient.setQueryData(["/api/auth/me"], null);
    throw new CommerceError(
      data?.message || "So‘rov bajarilmadi. Qayta urinib ko‘ring.",
      response.status,
      data?.code,
      data || undefined,
    );
  }
  return data as T;
}
export const walletKey = ["/api/commerce/wallet"];
export const commerceConfigKey = ["/api/commerce/config"];
export function useWallet() {
  const { user } = useAuth();
  return useQuery<Wallet>({
    queryKey: [...walletKey, user?.id],
    queryFn: ({ signal }) =>
      commerceRequest("GET", "/api/commerce/wallet", undefined, signal),
    enabled: !!user,
    staleTime: 15_000,
  });
}
export function useCommerceConfig() {
  return useQuery<CommerceConfig>({
    queryKey: commerceConfigKey,
    queryFn: ({ signal }) =>
      commerceRequest("GET", "/api/commerce/config", undefined, signal),
    staleTime: 60_000,
  });
}
export function WalletBadge() {
  const wallet = useWallet();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Link
      href="/wallet"
      className="coin-badge"
      aria-label="Coin hamyonini ochish"
    >
      <Coins size={19} />
      <span>{wallet.data ? `${wallet.data.balance} coin` : "Hamyon"}</span>
    </Link>
  );
}
export function WalletSummary() {
  const wallet = useWallet();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="wallet-summary">
      <Coins size={25} />
      <div>
        <strong>
          {wallet.data ? `${wallet.data.balance} coin` : "Coin hamyoni"}
        </strong>
        <p>Ochilgan darslaringizdan qayta foydalanish mumkin.</p>
      </div>
      <Link href="/wallet" className="quiet-link">
        Hamyon <ArrowRight size={18} />
      </Link>
    </div>
  );
}
export function DemoResumePrompt() {
  const { user } = useAuth();
  const config = useCommerceConfig();
  const [available, setAvailable] = useState(false);
  const demoId = config.data?.demoLessonId;
  useEffect(() => {
    setAvailable(false);
    if (!user || !demoId) return;
    try {
      for (let index = 0; index < sessionStorage.length; index++) {
        const key = sessionStorage.key(index);
        if (!key?.startsWith(`tube-demo:${demoId}:`)) continue;
        const value = JSON.parse(sessionStorage.getItem(key) || "null");
        if (
          value &&
          Date.now() - Number(value.updatedAt || 0) < 20 * 60_000 &&
          (typeof value.scores?.practice === "number" ||
            typeof value.scores?.vocabulary === "number")
        ) {
          setAvailable(true);
          break;
        }
      }
    } catch {
      /* Browser storage is optional. */
    }
  }, [user?.id, demoId]);
  if (!available || !demoId) return null;
  return (
    <div
      className="commerce-notice commerce-success"
      style={{ marginBottom: 20 }}
    >
      <strong>Namuna test natijangizni saqlang</strong>
      <p>
        Hisob ochishdan oldin bajargan testingiz natijasini saqlash uchun namuna
        darsga qayting.
      </p>
      <Link href={`/learn/${demoId}`} className="primary-link">
        Namuna darsga qaytish <ArrowRight size={18} />
      </Link>
    </div>
  );
}
export function safeReturnTo(search = window.location.search): string | null {
  const value = new URLSearchParams(search).get("returnTo");
  return value && /^\/learn\/[1-9]\d*$/.test(value) ? value : null;
}
export function returnQuery(returnTo: string | null) {
  return returnTo ? `?${new URLSearchParams({ returnTo })}` : "";
}
