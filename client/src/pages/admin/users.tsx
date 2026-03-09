import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import {
  Users, Plus, Search, Eye, Pencil, ShieldCheck, ShieldOff,
  KeyRound, Coins, Loader2, X, ArrowUpDown
} from "lucide-react";
import AdminLayout from "@/components/layouts/admin-layout";

type SafeUser = {
  id: string;
  fullName: string;
  username: string;
  role: string;
  isActive: boolean;
  coins: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CoinTransaction = {
  id: number;
  userId: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
};

const roleLabels: Record<string, string> = { admin: "Admin", teacher: "O'qituvchi", student: "O'quvchi" };
const roleBadgeStyles: Record<string, string> = {
  admin: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  teacher: "bg-primary/10 text-primary border-primary/20",
  student: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ fullName: "", username: "", password: "", role: "student", coins: 0 });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/admin/users", { ...data, coins: Number(data.coins) });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Foydalanuvchi yaratildi", description: `@${form.username} muvaffaqiyatli qo'shildi` });
      setForm({ fullName: "", username: "", password: "", role: "student", coins: 0 });
      onClose();
    },
    onError: (err: Error) => {
      const msg = err.message.includes("409") ? "Bu login allaqachon mavjud" : err.message.split(":").pop()?.trim() || "Xatolik yuz berdi";
      toast({ title: "Xatolik", description: msg, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle>Yangi foydalanuvchi qo'shish</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-4" data-testid="form-create-user">
          <div className="space-y-2">
            <Label>To'liq ism</Label>
            <Input placeholder="Ism familiya" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required data-testid="input-create-fullname" />
          </div>
          <div className="space-y-2">
            <Label>Login</Label>
            <Input placeholder="login_nomi" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required data-testid="input-create-username" />
          </div>
          <div className="space-y-2">
            <Label>Parol</Label>
            <Input type="password" placeholder="Kamida 6 belgi" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required data-testid="input-create-password" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="select-create-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">O'quvchi</SelectItem>
                  <SelectItem value="teacher">O'qituvchi</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Boshlang'ich tanga</Label>
              <Input type="number" min={0} value={form.coins} onChange={(e) => setForm({ ...form, coins: parseInt(e.target.value) || 0 })} data-testid="input-create-coins" />
            </div>
          </div>
          <Button type="submit" className="w-full bg-gradient-to-r from-primary to-cyan-500" disabled={createMutation.isPending} data-testid="button-submit-create-user">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Qo'shish
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, open, onClose }: { user: SafeUser | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ fullName: "", username: "", role: "student" });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${user!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Yangilandi", description: "Foydalanuvchi ma'lumotlari saqlandi" });
      onClose();
    },
    onError: (err: Error) => {
      const msg = err.message.includes("409") ? "Bu login allaqachon mavjud" : err.message.split(":").pop()?.trim() || "Xatolik yuz berdi";
      toast({ title: "Xatolik", description: msg, variant: "destructive" });
    },
  });

  const handleOpen = () => {
    if (user) setForm({ fullName: user.fullName, username: user.username, role: user.role });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) handleOpen(); else onClose(); }}>
      <DialogContent className="glass-strong border-border/50 max-w-md" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle>Foydalanuvchini tahrirlash</DialogTitle>
        </DialogHeader>
        {user && (
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(form); }} className="space-y-4" data-testid="form-edit-user">
            <div className="space-y-2">
              <Label>To'liq ism</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required data-testid="input-edit-fullname" />
            </div>
            <div className="space-y-2">
              <Label>Login</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required data-testid="input-edit-username" />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="select-edit-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">O'quvchi</SelectItem>
                  <SelectItem value="teacher">O'qituvchi</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-submit-edit-user">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
              Saqlash
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, open, onClose }: { user: SafeUser | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/users/${user!.id}/password`, { newPassword });
    },
    onSuccess: () => {
      toast({ title: "Parol yangilandi", description: `@${user!.username} paroli o'zgartirildi` });
      setNewPassword("");
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message.split(":").pop()?.trim() || "Xatolik", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setNewPassword(""); onClose(); } }}>
      <DialogContent className="glass-strong border-border/50 max-w-sm">
        <DialogHeader>
          <DialogTitle>Parolni yangilash</DialogTitle>
        </DialogHeader>
        {user && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{user.fullName}</span> (@{user.username}) uchun yangi parol kiriting.
            </p>
            <div className="space-y-2">
              <Label>Yangi parol</Label>
              <Input type="password" placeholder="Kamida 6 belgi" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} data-testid="input-new-password" />
            </div>
            <Button
              className="w-full"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || newPassword.length < 6}
              data-testid="button-submit-password"
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Parolni yangilash
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CoinDialog({ user, open, onClose }: { user: SafeUser | null; open: boolean; onClose: () => void }) {
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

  const txTypeLabels: Record<string, string> = {
    admin_add: "Admin qo'shdi",
    admin_remove: "Admin ayirdi",
    lesson_reward: "Dars mukofoti",
    quiz_reward: "Test mukofoti",
    purchase: "Xarid",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setAmount(0); setDescription(""); onClose(); } }}>
      <DialogContent className="glass-strong border-border/50 max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Tanga boshqaruvi</DialogTitle>
        </DialogHeader>
        {user && (
          <div className="space-y-6">
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
                <p className="text-lg font-bold text-amber-500">{coinHistoryQuery.data?.balance ?? user.coins}</p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Tanga qo'shish / ayirish</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tur</Label>
                  <Select value={type} onValueChange={(v) => setType(v as "add" | "remove")}>
                    <SelectTrigger data-testid="select-coin-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Qo'shish</SelectItem>
                      <SelectItem value="remove">Ayirish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Miqdor</Label>
                  <Input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(parseInt(e.target.value) || 0)} placeholder="0" data-testid="input-coin-amount" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Izoh</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sabab yoki izoh kiriting" data-testid="input-coin-description" />
              </div>
              <Button
                className="w-full"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || amount < 1 || !description.trim()}
                data-testid="button-submit-coins"
              >
                {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Coins className="w-4 h-4 mr-2" />}
                {type === "add" ? "Coin qo'shish" : "Coin ayirish"}
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Coin tarixi</h3>
              {coinHistoryQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : coinHistoryQuery.data?.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Tranzaksiyalar mavjud emas</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
                  {coinHistoryQuery.data?.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30" data-testid={`tx-${tx.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{tx.description || txTypeLabels[tx.type] || tx.type}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold ${tx.amount > 0 ? "text-emerald-500" : "text-red-400"}`}>
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

function UserDetailDialog({ user, open, onClose }: { user: SafeUser | null; open: boolean; onClose: () => void }) {
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle>Foydalanuvchi ma'lumotlari</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-lg font-bold">
                {getInitials(user.fullName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold" data-testid="text-detail-fullname">{user.fullName}</h3>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
              <div className="flex gap-2 mt-1.5">
                <Badge variant="outline" className={roleBadgeStyles[user.role]}>
                  {roleLabels[user.role]}
                </Badge>
                <Badge variant={user.isActive ? "secondary" : "destructive"} className={user.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : ""}>
                  {user.isActive ? "Faol" : "Bloklangan"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Tangalar" value={String(user.coins)} />
            <InfoRow label="Rol" value={roleLabels[user.role]} />
            <InfoRow label="Ro'yxatdan o'tgan" value={new Date(user.createdAt).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric" })} />
            <InfoRow label="Oxirgi kirish" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric" }) : "Hali kirmagan"} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<SafeUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<SafeUser | null>(null);
  const [coinUser, setCoinUser] = useState<SafeUser | null>(null);
  const [detailUser, setDetailUser] = useState<SafeUser | null>(null);

  const usersQuery = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/status`, { isActive });
      return res.json();
    },
    onSuccess: (data: SafeUser) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: data.isActive ? "Faollashtirildi" : "Bloklandi", description: `@${data.username} ${data.isActive ? "faollashtirildi" : "bloklandi"}` });
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message.split(":").pop()?.trim() || "Xatolik", variant: "destructive" });
    },
  });

  const filteredUsers = (usersQuery.data || []).filter((u) => {
    if (search) {
      const q = search.toLowerCase();
      if (!u.fullName.toLowerCase().includes(q) && !u.username.toLowerCase().includes(q)) return false;
    }
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter === "active" && !u.isActive) return false;
    if (statusFilter === "blocked" && u.isActive) return false;
    return true;
  });

  return (
    <AdminLayout title="Foydalanuvchilar" subtitle="Tizim foydalanuvchilarini boshqaring">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Ism yoki login bo'yicha qidirish..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-muted/30 border-border/50"
                data-testid="input-search-users"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[140px] bg-muted/30 border-border/50" data-testid="select-filter-role">
                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="teacher">O'qituvchi</SelectItem>
                <SelectItem value="student">O'quvchi</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-muted/30 border-border/50" data-testid="select-filter-status">
                <SelectValue placeholder="Holat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                <SelectItem value="active">Faol</SelectItem>
                <SelectItem value="blocked">Bloklangan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="bg-gradient-to-r from-primary to-cyan-500 shadow-lg shadow-primary/20" onClick={() => setCreateOpen(true)} data-testid="button-create-user">
            <Plus className="w-4 h-4 mr-2" />
            User qo'shish
          </Button>
        </div>

        {usersQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="glass border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{filteredUsers.length} foydalanuvchi</span>
              {search && <Badge variant="secondary" className="text-xs">{search}</Badge>}
            </div>

            {filteredUsers.length === 0 ? (
              <Card className="glass border-border/50">
                <CardContent className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">Natija topilmadi</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((u) => (
                  <Card key={u.id} className="glass border-border/50 hover:border-violet-500/20 transition-colors" data-testid={`card-user-${u.username}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Avatar className="w-10 h-10 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-semibold">
                            {getInitials(u.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{u.fullName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground">@{u.username}</p>
                            <span className="text-muted-foreground/30">·</span>
                            <span className="text-xs text-amber-500 font-medium">{u.coins} tanga</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={`text-[11px] ${roleBadgeStyles[u.role]}`}>
                            {roleLabels[u.role]}
                          </Badge>
                          <Badge variant={u.isActive ? "secondary" : "destructive"} className={`text-[11px] ${u.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : ""}`}>
                            {u.isActive ? "Faol" : "Bloklangan"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailUser(u)} title="Ko'rish" data-testid={`button-view-${u.username}`}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditUser(u)} title="Tahrirlash" data-testid={`button-edit-${u.username}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPasswordUser(u)} title="Parolni yangilash" data-testid={`button-password-${u.username}`}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCoinUser(u)} title="Tangalar" data-testid={`button-coins-${u.username}`}>
                            <Coins className="w-3.5 h-3.5 text-amber-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => statusMutation.mutate({ id: u.id, isActive: !u.isActive })}
                            disabled={statusMutation.isPending}
                            title={u.isActive ? "Bloklash" : "Faollashtirish"}
                            data-testid={`button-status-${u.username}`}
                          >
                            {u.isActive ? <ShieldOff className="w-3.5 h-3.5 text-red-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserDialog user={editUser} open={!!editUser} onClose={() => setEditUser(null)} />
      <PasswordDialog user={passwordUser} open={!!passwordUser} onClose={() => setPasswordUser(null)} />
      <CoinDialog user={coinUser} open={!!coinUser} onClose={() => setCoinUser(null)} />
      <UserDetailDialog user={detailUser} open={!!detailUser} onClose={() => setDetailUser(null)} />
    </AdminLayout>
  );
}
