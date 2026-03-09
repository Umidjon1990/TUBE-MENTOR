import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Coins, Search, X, Plus, Minus, Loader2, History, TrendingUp, ArrowDown, ArrowUp } from "lucide-react";

type SafeUser = {
  id: string;
  fullName: string;
  username: string;
  role: string;
  isActive: boolean;
  coins: number;
};

type CoinTransaction = {
  id: number;
  userId: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}

const txTypeLabels: Record<string, string> = {
  admin_add: "Admin qo'shdi",
  admin_remove: "Admin ayirdi",
  lesson_reward: "Dars mukofoti",
  quiz_reward: "Test mukofoti",
  purchase: "Xarid",
};

function CoinActionDialog({ user, open, onClose }: { user: SafeUser | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(0);
  const [type, setType] = useState<"add" | "remove">("add");
  const [description, setDescription] = useState("");

  const coinHistoryQuery = useQuery<{ balance: number; transactions: CoinTransaction[] }>({
    queryKey: ["/api/admin/users", user?.id, "coins"],
    enabled: open && !!user,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${user!.id}/coins`, { amount, type, description });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", user!.id, "coins"] });
      toast({ title: type === "add" ? "Tanga qo'shildi" : "Tanga ayirildi", description: `${amount} tanga ${type === "add" ? "qo'shildi" : "ayirildi"}` });
      setAmount(0);
      setDescription("");
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message.split(":").pop()?.trim() || "Xatolik", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setAmount(0); setDescription(""); onClose(); } }}>
      <DialogContent className="glass-strong border-border/50 max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Tanga boshqaruvi</DialogTitle>
        </DialogHeader>
        {user && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-semibold">
                  {getInitials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-sm">{user.fullName}</p>
                <p className="text-xs text-muted-foreground">@{user.username}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Joriy balans</p>
                <p className="text-xl font-bold text-amber-500" data-testid="text-coin-balance">{coinHistoryQuery.data?.balance ?? user.coins}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amal</Label>
                  <Select value={type} onValueChange={(v) => setType(v as "add" | "remove")}>
                    <SelectTrigger data-testid="select-coin-action-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Coin qo'shish</SelectItem>
                      <SelectItem value="remove">Coin ayirish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Miqdor</Label>
                  <Input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} placeholder="0" data-testid="input-coin-action-amount" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Izoh</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sabab yoki izoh" data-testid="input-coin-action-description" />
              </div>
              <Button
                className={`w-full ${type === "add" ? "bg-gradient-to-r from-emerald-600 to-emerald-500" : "bg-gradient-to-r from-red-600 to-red-500"}`}
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || amount < 1 || !description.trim()}
                data-testid="button-submit-coin-action"
              >
                {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : type === "add" ? <Plus className="w-4 h-4 mr-2" /> : <Minus className="w-4 h-4 mr-2" />}
                {type === "add" ? "Coin qo'shish" : "Coin ayirish"}
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Coin tarixi</h3>
              </div>
              {coinHistoryQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : coinHistoryQuery.data?.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Tranzaksiyalar mavjud emas</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                  {coinHistoryQuery.data?.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30" data-testid={`coin-tx-${tx.id}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.amount > 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                        {tx.amount > 0 ? <ArrowUp className="w-4 h-4 text-emerald-500" /> : <ArrowDown className="w-4 h-4 text-red-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{tx.description || txTypeLabels[tx.type] || tx.type}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`text-sm font-bold ${tx.amount > 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCoinsPage() {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);

  const usersQuery = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const users = usersQuery.data || [];
  const totalCoins = users.reduce((sum, u) => sum + u.coins, 0);
  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => b.coins - a.coins);

  return (
    <AdminLayout title="Coin boshqaruvi" subtitle="Tanga tizimini boshqaring">
      <div className="space-y-6">
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="glass border-border/50" data-testid="card-total-coins">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-amber-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-500">{totalCoins.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Jami tangalar</p>
            </CardContent>
          </Card>
          <Card className="glass border-border/50" data-testid="card-users-count">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
              </div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-xs text-muted-foreground">Foydalanuvchilar</p>
            </CardContent>
          </Card>
          <Card className="glass border-border/50" data-testid="card-avg-coins">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-violet-400" />
                </div>
              </div>
              <p className="text-2xl font-bold">{users.length ? Math.round(totalCoins / users.length) : 0}</p>
              <p className="text-xs text-muted-foreground">O'rtacha tanga</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Foydalanuvchi qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted/30 border-border/50"
              data-testid="input-search-coin-users"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        {usersQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="glass border-border/50">
                <CardContent className="p-4 flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20" /></div>
                  <Skeleton className="h-8 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sortedUsers.length === 0 ? (
          <Card className="glass border-border/50">
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Natija topilmadi</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sortedUsers.map((u, index) => (
              <Card key={u.id} className="glass border-border/50 hover:border-amber-500/20 transition-colors" data-testid={`coin-card-${u.username}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-6 text-center font-mono">{index + 1}</span>
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-semibold">
                      {getInitials(u.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{u.fullName}</p>
                    <p className="text-xs text-muted-foreground">@{u.username}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-500">{u.coins}</p>
                      <p className="text-[10px] text-muted-foreground">tanga</p>
                    </div>
                    <Button variant="outline" size="sm" className="border-amber-500/30 hover:border-amber-500/60 text-amber-500" onClick={() => setSelectedUser(u)} data-testid={`button-manage-coins-${u.username}`}>
                      <Coins className="w-3.5 h-3.5 mr-1.5" />
                      Boshqarish
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CoinActionDialog user={selectedUser} open={!!selectedUser} onClose={() => setSelectedUser(null)} />
    </AdminLayout>
  );
}
