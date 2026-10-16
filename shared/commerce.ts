export const WELCOME_COINS = 30;
export const LESSON_COST = 10;
export const ORDER_STATUSES = [
  "created",
  "awaiting_payment",
  "receipt_submitted",
  "under_review",
  "needs_info",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "partially_refunded",
  "refunded",
] as const;
export type PaymentOrderStatus = (typeof ORDER_STATUSES)[number];
export interface CommerceSettings {
  welcomeCoins: number;
  lessonCost: number;
  lessonPrices: Record<string, number>;
  demoLessonId: number | null;
  paymentsEnabled: boolean;
  recipientName: string;
  cardNumber: string;
  paymeUrl: string;
  paymentInstructions: string;
  reviewHours: string;
}
export const DEFAULT_COMMERCE_SETTINGS: CommerceSettings = {
  welcomeCoins: WELCOME_COINS,
  lessonCost: LESSON_COST,
  lessonPrices: {},
  demoLessonId: null,
  paymentsEnabled: false,
  recipientName: "",
  cardNumber: "",
  paymeUrl: "",
  paymentInstructions: "",
  reviewHours: "",
};
export interface CoinPackageDTO {
  id: number;
  name: string;
  coins: number;
  priceUzs: number;
  isActive: boolean;
}
export interface PaymentReceiptDTO {
  id: number;
  url: string;
  mimeType: string;
  originalName: string;
  createdAt: string;
  duplicateWarning?: boolean;
}
export interface PaymentOrderDTO {
  id: string;
  packageName: string;
  coins: number;
  priceUzs: number;
  status: PaymentOrderStatus;
  reason: string | null;
  bankReference: string | null;
  createdAt: string;
  expiresAt: string;
  refundedCoins: number;
  instructions: Pick<
    CommerceSettings,
    | "recipientName"
    | "cardNumber"
    | "paymeUrl"
    | "paymentInstructions"
    | "reviewHours"
  >;
  receipts: PaymentReceiptDTO[];
  userId?: string;
  fullName?: string;
  duplicateReceiptWarning?: boolean;
}
export interface CoinTransactionDTO {
  id: number;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
  balanceBefore: number | null;
  balanceAfter: number | null;
}
export interface WalletDTO {
  balance: number;
  bonusGranted: boolean;
  transactions: CoinTransactionDTO[];
  ownedLessonIds: number[];
}
export type PaymentReviewInput = {
  decision: "approve" | "reject" | "needs_info";
  bankReference?: string;
  reason?: string;
};

export const SUPPORT_CATEGORIES = [
  "payment",
  "lesson",
  "refund",
  "other",
] as const;
export const SUPPORT_STATUSES = ["open", "answered", "closed"] as const;
export interface SupportTicketDTO {
  id: string;
  subject: string;
  category: (typeof SUPPORT_CATEGORIES)[number];
  status: (typeof SUPPORT_STATUSES)[number];
  orderId: string | null;
  lessonId: number | null;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  fullName?: string;
}
export interface SupportMessageDTO {
  id: number;
  message: string;
  authorName: string;
  authorRole: "student" | "admin";
  createdAt: string;
}
export interface SupportThreadDTO {
  ticket: SupportTicketDTO;
  messages: SupportMessageDTO[];
}

export function lessonPrice(
  settings: Pick<CommerceSettings, "lessonCost" | "lessonPrices">,
  id: number,
) {
  return settings.lessonPrices[String(id)] ?? settings.lessonCost;
}
