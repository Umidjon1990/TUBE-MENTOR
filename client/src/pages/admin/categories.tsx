import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { FolderTree, Plus, Pencil, Trash2, Loader2, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Category } from "@shared/schema";

function normalizeGoogleDriveUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  let fileId: string | null = null;
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/thumbnail\?id=([a-zA-Z0-9_-]+)/,
    /docs\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/,
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pat of patterns) {
    const match = trimmed.match(pat);
    if (match) { fileId = match[1]; break; }
  }
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}=s800`;
  }
  return trimmed;
}

export default function AdminCategoriesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; thumbnailUrl: string }) =>
      apiRequest("POST", "/api/admin/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Kategoriya yaratildi" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; description: string; thumbnailUrl: string } }) =>
      apiRequest("PATCH", `/api/admin/categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Kategoriya yangilandi" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Kategoriya o'chirildi" });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setThumbnailUrl("");
    setDialogOpen(true);
  }

  function openEdit(cat: Category) {
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || "");
    setThumbnailUrl(cat.thumbnailUrl || "");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingCategory(null);
    setName("");
    setDescription("");
    setThumbnailUrl("");
  }

  function handleSubmit() {
    if (!name.trim()) return;
    const normalizedThumb = normalizeGoogleDriveUrl(thumbnailUrl.trim());
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: { name: name.trim(), description: description.trim(), thumbnailUrl: normalizedThumb } });
    } else {
      createMutation.mutate({ name: name.trim(), description: description.trim(), thumbnailUrl: normalizedThumb });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminLayout title="Kategoriyalar" subtitle="Dars kategoriyalarini boshqaring">
      <Card className="glass border-border/50" data-testid="card-admin-categories">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderTree className="w-5 h-5 text-primary" />
            Kategoriyalar ({categories.length})
          </CardTitle>
          <Button size="sm" className="gap-1.5" onClick={openCreate} data-testid="button-add-category">
            <Plus className="w-4 h-4" />
            Qo'shish
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-4">
                <FolderTree className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">Hali kategoriya yo'q</p>
              <Button size="sm" onClick={openCreate} data-testid="button-add-category-empty">
                <Plus className="w-4 h-4 mr-1.5" />
                Birinchi kategoriyani yarating
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                  data-testid={`category-row-${cat.id}`}
                >
                  {cat.thumbnailUrl && (
                    <div className="w-16 h-10 rounded overflow-hidden shrink-0 bg-muted/30 mr-2">
                      <img
                        src={normalizeGoogleDriveUrl(cat.thumbnailUrl)}
                        alt={cat.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" data-testid={`text-category-name-${cat.id}`}>{cat.name}</span>
                      <Badge variant="outline" className="text-[10px]">{cat.slug}</Badge>
                    </div>
                    {cat.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{cat.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(cat)}
                      data-testid={`button-edit-category-${cat.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(cat.id)}
                      data-testid={`button-delete-category-${cat.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Kategoriyani tahrirlash" : "Yangi kategoriya"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nomi</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masalan: Matematika"
                data-testid="input-category-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tavsif (ixtiyoriy)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kategoriya haqida qisqa izoh"
                data-testid="input-category-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-primary" />
                Rasm URL (Google Drive yoki to'g'ridan-to'g'ri link)
              </label>
              <Input
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/... yoki to'g'ridan-to'g'ri URL"
                data-testid="input-category-thumbnail"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Tavsiya: 800×450px (16:9). Google Drive linkini qo'ying — avtomatik moslashtiriladi.
              </p>
              {thumbnailUrl.trim() && (
                <div className="mt-2 rounded-lg overflow-hidden border border-border/50 bg-muted/30">
                  <img
                    src={normalizeGoogleDriveUrl(thumbnailUrl.trim())}
                    alt="Preview"
                    className="w-full aspect-video object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    data-testid="img-category-preview"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-category">
              Bekor qilish
            </Button>
            <Button onClick={handleSubmit} disabled={!name.trim() || isPending} data-testid="button-save-category">
              {isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {editingCategory ? "Saqlash" : "Yaratish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kategoriyani o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kategoriyani o'chirmoqchimisiz? Ushbu kategoriyaga tegishli darslar kategoriyasiz qoladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-category">Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete-category"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              O'chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
