import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FolderOpen, Plus, Pencil, Trash2, Loader2, Eye, EyeOff, CheckCircle, Clock, Globe, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Collection } from "@shared/schema";

type CollectionWithMeta = Collection & { creatorName: string; lessonCount: number };

const statusLabels: Record<string, string> = {
  draft: "Qoralama",
  pending: "Kutilmoqda",
  approved: "Tasdiqlangan",
  published: "E'lon qilingan",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400",
  pending: "bg-amber-500/10 text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-400",
  published: "bg-cyan-500/10 text-cyan-400",
};

const levelLabels: Record<string, string> = {
  beginner: "Boshlang'ich",
  intermediate: "O'rta",
  advanced: "Yuqori",
};

export default function AdminCollectionsPage() {
  const { toast } = useToast();
  const [editCollection, setEditCollection] = useState<CollectionWithMeta | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCoverImage, setEditCoverImage] = useState("");
  const [editTargetLanguage, setEditTargetLanguage] = useState("ar");
  const [editLevel, setEditLevel] = useState("beginner");
  const [editSortOrder, setEditSortOrder] = useState(0);

  const { data: allCollections = [], isLoading } = useQuery<CollectionWithMeta[]>({
    queryKey: ["/api/admin/collections"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/admin/collections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collections"] });
      toast({ title: "Papka yangilandi" });
      setEditDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/collections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collections"] });
      toast({ title: "Papka o'chirildi" });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/admin/collections/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collections"] });
      toast({ title: "Status yangilandi" });
    },
  });

  function openEdit(c: CollectionWithMeta) {
    setEditCollection(c);
    setEditName(c.name);
    setEditDescription(c.description || "");
    setEditCoverImage(c.coverImage || "");
    setEditTargetLanguage(c.targetLanguage);
    setEditLevel(c.level);
    setEditSortOrder(c.sortOrder);
    setEditDialogOpen(true);
  }

  function handleSave() {
    if (!editCollection) return;
    updateMutation.mutate({
      id: editCollection.id,
      data: {
        name: editName,
        description: editDescription,
        coverImage: editCoverImage,
        targetLanguage: editTargetLanguage,
        level: editLevel,
        sortOrder: editSortOrder,
      },
    });
  }

  return (
    <AdminLayout title="Papkalar boshqaruvi">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
            <FolderOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-admin-collections-title">Papkalar boshqaruvi</h1>
            <p className="text-sm text-muted-foreground">Barcha papkalarni boshqarish, tasdiqlash va e'lon qilish</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : allCollections.length === 0 ? (
          <Card className="glass border-border/50">
            <CardContent className="p-12 text-center">
              <FolderOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Papkalar topilmadi</h3>
              <p className="text-sm text-muted-foreground">Hozircha hech qanday papka yaratilmagan.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {allCollections.map((c) => (
              <Card key={c.id} className="glass border-border/50" data-testid={`card-collection-${c.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {c.coverImage ? (
                        <img src={c.coverImage} alt={c.name} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <FolderOpen className="w-7 h-7 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold truncate" data-testid={`text-collection-name-${c.id}`}>{c.name}</h3>
                        <Badge className={statusColors[c.status] || ""} data-testid={`badge-status-${c.id}`}>
                          {statusLabels[c.status] || c.status}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {c.targetLanguage === "ar" ? "Arab" : "Ingliz"}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {levelLabels[c.level] || c.level}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.creatorName} | {c.lessonCount} ta dars | Tartib: {c.sortOrder}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(c.status === "draft" || c.status === "pending") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-emerald-500/30 text-emerald-400"
                          onClick={() => statusMutation.mutate({ id: c.id, status: "approved" })}
                          data-testid={`button-approve-${c.id}`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          Tasdiqlash
                        </Button>
                      )}
                      {c.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-red-500/30 text-red-400"
                          onClick={() => statusMutation.mutate({ id: c.id, status: "draft" })}
                          data-testid={`button-reject-${c.id}`}
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          Rad etish
                        </Button>
                      )}
                      {c.status === "approved" && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-gradient-to-r from-primary to-cyan-500"
                          onClick={() => statusMutation.mutate({ id: c.id, status: "published" })}
                          data-testid={`button-publish-${c.id}`}
                        >
                          <Globe className="w-3.5 h-3.5 mr-1" />
                          E'lon qilish
                        </Button>
                      )}
                      {c.status === "published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-orange-500/30 text-orange-400"
                          onClick={() => statusMutation.mutate({ id: c.id, status: "approved" })}
                          data-testid={`button-unpublish-${c.id}`}
                        >
                          <EyeOff className="w-3.5 h-3.5 mr-1" />
                          Yashirish
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)} data-testid={`button-edit-${c.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(c.id)} data-testid={`button-delete-${c.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Papkani tahrirlash</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Papka nomi" data-testid="input-edit-name" />
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Tavsif" data-testid="input-edit-description" />
              <Input value={editCoverImage} onChange={(e) => setEditCoverImage(e.target.value)} placeholder="Muqova rasmi URL" data-testid="input-edit-cover" />
              <div className="grid grid-cols-2 gap-3">
                <Select value={editTargetLanguage} onValueChange={setEditTargetLanguage}>
                  <SelectTrigger data-testid="select-edit-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">Arab tili</SelectItem>
                    <SelectItem value="en">Ingliz tili</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={editLevel} onValueChange={setEditLevel}>
                  <SelectTrigger data-testid="select-edit-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Boshlang'ich</SelectItem>
                    <SelectItem value="intermediate">O'rta</SelectItem>
                    <SelectItem value="advanced">Yuqori</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input type="number" value={editSortOrder} onChange={(e) => setEditSortOrder(parseInt(e.target.value) || 0)} placeholder="Tartib raqami" data-testid="input-edit-sort" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Bekor qilish</Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-edit">
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Saqlash
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Papkani o'chirish</AlertDialogTitle>
              <AlertDialogDescription>Haqiqatan ham bu papkani o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">
                O'chirish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
