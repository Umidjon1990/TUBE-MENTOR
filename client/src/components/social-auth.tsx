import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiGoogle, SiTelegram } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/learning-shell";
import { useAuth } from "@/hooks/use-auth";
import { request, errorText } from "@/lib/learning-api";

export interface AuthConfig {
  googleEnabled: boolean;
  telegramEnabled: boolean;
  emailEnabled: boolean;
  signupEnabled: boolean;
  socialSignupEnabled: boolean;
}
export function useAuthConfig() {
  return useQuery<AuthConfig>({
    queryKey: ["/api/auth/config"],
    queryFn: () => request("GET", "/api/auth/config"),
  });
}
export function SocialAuthButtons({ config }: { config?: AuthConfig }) {
  if (!config?.googleEnabled && !config?.telegramEnabled) return null;
  return (
    <div className="social-auth-buttons" aria-label="Hisob orqali kirish">
      {config.googleEnabled && (
        <a className="google-button" href="/api/auth/google">
          <SiGoogle aria-hidden="true" />
          Google orqali davom etish
        </a>
      )}
      {config.telegramEnabled && (
        <a className="telegram-button" href="/api/auth/telegram">
          <SiTelegram aria-hidden="true" />
          Telegram orqali davom etish
        </a>
      )}
    </div>
  );
}
export function LinkedAccountsPanel() {
  const { user } = useAuth();
  const config = useAuthConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const params = new URLSearchParams(window.location.search);
  const linked = params.get("linked");
  const failure = params.get("link_error");
  const errors: Record<string, string> = {
    account_in_use:
      "Bu hisob boshqa profilga ulangan. Avval o‘sha profilga kiring.",
    provider_already_linked:
      "Profilingizga bu xizmatning boshqa hisobi allaqachon ulangan.",
    link_session_expired:
      "Kirish muddati tugagan. Hisobingizga qayta kirib, ulashni takrorlang.",
    google_failed: "Google hisobi ulanmadi. Qayta urinib ko‘ring.",
    telegram_failed: "Telegram hisobi ulanmadi. Qayta urinib ko‘ring.",
  };
  async function connect(provider: "google" | "telegram") {
    setBusy(provider);
    setError("");
    try {
      const result = await request<{ url: string }>(
        "POST",
        `/api/auth/accounts/${provider}/link`,
        {},
      );
      window.location.assign(result.url);
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }
  return (
    <Panel className="linked-accounts">
      <h2>Kirish hisoblari</h2>
      <p className="muted small">
        Google va Telegram’ni shu profilga ulang. Darslar va lug‘atingiz bir
        joyda saqlanadi.
      </p>
      {(linked === "google" || linked === "telegram") &&
        user?.linkedAccounts?.[linked] && (
          <p role="status" className="success-text">
            {linked === "google" ? "Google" : "Telegram"} hisobi ulandi.
          </p>
        )}
      {(error || failure) && (
        <p role="alert" className="inline-error">
          {error || errors[failure!] || "Hisob ulanmadi. Qayta urinib ko‘ring."}
        </p>
      )}
      {config.error && (
        <p role="alert" className="inline-error">
          {errorText(config.error)}
        </p>
      )}
      {(["google", "telegram"] as const).map((provider) => {
        const connected = Boolean(user?.linkedAccounts?.[provider]);
        const enabled =
          config.data?.[
            provider === "google" ? "googleEnabled" : "telegramEnabled"
          ];
        const name = provider === "google" ? "Google" : "Telegram";
        const Icon = provider === "google" ? SiGoogle : SiTelegram;
        return (
          <div className="linked-account-row" key={provider}>
            <div>
              <Icon aria-hidden="true" />
              <span>
                <strong>{name}</strong>
                <small>
                  {connected
                    ? "Ulangan"
                    : config.isLoading
                      ? "Tekshirilmoqda…"
                      : enabled
                        ? "Hali ulanmagan"
                        : "Hozir mavjud emas"}
                </small>
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={connected || !enabled || Boolean(busy)}
              onClick={() => void connect(provider)}
              aria-label={
                connected ? `${name} hisobi ulangan` : `${name} hisobini ulash`
              }
            >
              {connected
                ? "Ulangan"
                : busy === provider
                  ? "Ochilmoqda…"
                  : "Ulash"}
            </Button>
          </div>
        );
      })}
    </Panel>
  );
}
