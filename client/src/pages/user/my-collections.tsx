import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  FolderOpen, Plus, Pencil, Trash2, Loader2, Eye, BookOpen, ArrowLeft,
  GripVertical, X, Search, Globe, EyeOff, ArrowUp, ArrowDown, ImagePlus, XCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Collection, Lesson } from "@shared/schema";

type CollectionWithMeta = Collection & { lessonCount: number };
type CollectionDetail = Collection & { lessons: (Lesson & { orderIndex: number })[] };

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

export default function MyCollectionsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<number | null>(null);
  const [addLessonOpen, setAddLessonOpen] = useState(false);
  const [lessonSearch, setLessonSearch] = useState("");

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCoverImage, setFormCoverImage] = useState("");
  const [formTargetLanguage, setFormTargetLanguage] = useState("ar");
  const [formLevel, setFormLevel] = useState("beginner");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { data: myCollections = [], isLoading } = useQuery<CollectionWithMeta[]>({
    queryKey: ["/api/user/collections"],
  });

  const { data: collectionDetail } = useQuery<CollectionDetail>({
    queryKey: ["/api/user/collections", selectedCollection],
    enabled: !!selectedCollection,
  });

  const { data: myLessons = [] } = useQuery<Lesson[]>({
    queryKey: ["/api/user/lessons"],
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/user/collections", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections"] });
      toast({ title: "Papka yaratildi" });
      setCreateOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/user/collections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections"] });
      toast({ title: "Papka yangilandi" });
      setEditOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/user/collections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections"] });
      toast({ title: "Papka o'chirildi" });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const addLessonMutation = useMutation({
    mutationFn: ({ collectionId, lessonId }: { collectionId: number; lessonId: number }) =>
      apiRequest("POST", `/api/user/collections/${collectionId}/lessons`, {
        lessonId,
        orderIndex: (collectionDetail?.lessons?.length ?? 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections", selectedCollection] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections"] });
      toast({ title: "Dars qo'shildi" });
      setAddLessonOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const removeLessonMutation = useMutation({
    mutationFn: ({ collectionId, lessonId }: { collectionId: number; lessonId: number }) =>
      apiRequest("DELETE", `/api/user/collections/${collectionId}/lessons/${lessonId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections", selectedCollection] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections"] });
      toast({ title: "Dars olib tashlandi" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: ({ collectionId, items }: { collectionId: number; items: { lessonId: number; orderIndex: number }[] }) =>
      apiRequest("PUT", `/api/user/collections/${collectionId}/lessons/order`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections", selectedCollection] });
    },
  });

  function moveLessonOrder(lessonId: number, direction: "up" | "down") {
    if (!collectionDetail?.lessons || !selectedCollection) return;
    const sorted = [...collectionDetail.lessons].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = sorted.findIndex(l => l.id === lessonId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const items = sorted.map((l, i) => {
      if (i === idx) return { lessonId: l.id, orderIndex: swapIdx };
      if (i === swapIdx) return { lessonId: l.id, orderIndex: idx };
      return { lessonId: l.id, orderIndex: i };
    });
    reorderMutation.mutate({ collectionId: selectedCollection, items });
  }

  const publishMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/user/collections/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/collections"] });
      toast({ title: "Status yangilandi" });
    },
  });

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormCoverImage("");
    setFormTargetLanguage("ar");
    setFormLevel("beginner");
    setFormSortOrder(0);
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function openEdit(c: CollectionWithMeta) {
    setFormName(c.name);
    setFormDescription(c.description || "");
    setFormCoverImage(c.coverImage || "");
    setFormTargetLanguage(c.targetLanguage);
    setFormLevel(c.level);
    setFormSortOrder(c.sortOrder);
    setSelectedCollection(c.id);
    setEditOpen(true);
  }

  function openManage(c: CollectionWithMeta) {
    setSelectedCollection(c.id);
    setManageOpen(true);
  }

  function handleCreate() {
    createMutation.mutate({
      name: formName,
      description: formDescription,
      coverImage: formCoverImage || undefined,
      targetLanguage: formTargetLanguage,
      level: formLevel,
      sortOrder: formSortOrder,
    });
  }

  function handleUpdate() {
    if (!selectedCollection) return;
    updateMutation.mutate({
      id: selectedCollection,
      data: {
        name: formName,
        description: formDescription,
        coverImage: formCoverImage || undefined,
        targetLanguage: formTargetLanguage,
        level: formLevel,
        sortOrder: formSortOrder,
      },
    });
  }

  const existingLessonIds = new Set(collectionDetail?.lessons?.map(l => l.id) ?? []);
  const availableLessons = myLessons.filter(
    l => !existingLessonIds.has(l.id) && (!lessonSearch || l.title.toLowerCase().includes(lessonSearch.toLowerCase()))
  );

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("cover", file);
      const res = await fetch("/api/upload/cover", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Yuklashda xatolik");
      }
      const { url } = await res.json();
      setFormCoverImage(url);
      toast({ title: "Rasm yuklandi" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Yuklashda xatolik";
      toast({ title: "Xatolik", description: msg, variant: "destructive" });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  const collectionFormJSX = (
    <div className="space-y-4">
      <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Papka nomi" data-testid="input-collection-name" />
      <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Tavsif (ixtiyoriy)" rows={3} data-testid="input-collection-description" />
      <div>
        <label className="text-sm text-muted-foreground mb-1.5 block">Muqova rasmi</label>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleCoverUpload}
          className="hidden"
          data-testid="input-cover-file"
        />
        {formCoverImage ? (
          <div className="relative group w-full rounded-lg overflow-hidden border border-border/50 bg-black/20">
            <img src={formCoverImage} alt="Muqova" className="w-full max-h-48 object-contain" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() => coverInputRef.current?.click()}
                data-testid="button-change-cover"
              >
                <ImagePlus className="w-3.5 h-3.5 mr-1" />
                Almashtirish
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={() => setFormCoverImage("")}
                data-testid="button-remove-cover"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                O'chirish
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="w-full h-28 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/40 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary"
            data-testid="button-upload-cover"
          >
            {uploadingCover ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <ImagePlus className="w-6 h-6" />
            )}
            <span className="text-xs">
              {uploadingCover ? "Yuklanmoqda..." : "Muqova rasmi yuklash"}
            </span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select value={formTargetLanguage} onValueChange={setFormTargetLanguage}>
          <SelectTrigger data-testid="select-collection-language">
            <SelectValue placeholder="Til" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ar">Arab tili</SelectItem>
            <SelectItem value="en">Ingliz tili</SelectItem>
          </SelectContent>
        </Select>
        <Select value={formLevel} onValueChange={setFormLevel}>
          <SelectTrigger data-testid="select-collection-level">
            <SelectValue placeholder="Daraja" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beginner">Boshlang'ich</SelectItem>
            <SelectItem value="intermediate">O'rta</SelectItem>
            <SelectItem value="advanced">Yuqori</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input type="number" value={formSortOrder} onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)} placeholder="Tartib raqami" data-testid="input-collection-sort" />
    </div>
  );

  return (
    <UserLayout title="Papkalarim">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-my-collections-title">Papkalarim</h1>
              <p className="text-sm text-muted-foreground">Darslarni papkalarga tartiblab joylashtiring</p>
            </div>
          </div>
          <Button onClick={openCreate} className="gap-2" data-testid="button-create-collection">
            <Plus className="w-4 h-4" />
            Yangi papka
          </Button>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="glass border-border/50">
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : myCollections.length === 0 ? (
          <Card className="glass border-border/50">
            <CardContent className="p-12 text-center">
              <FolderOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2" data-testid="text-no-collections">Papkalar yo'q</h3>
              <p className="text-sm text-muted-foreground mb-4">Darslaringizni tartibga solish uchun papka yarating.</p>
              <Button onClick={openCreate} className="gap-2" data-testid="button-create-first">
                <Plus className="w-4 h-4" />
                Birinchi papkani yarating
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myCollections.map((c) => (
              <Card key={c.id} className="glass border-border/50 hover:border-primary/30 transition-all duration-300" data-testid={`card-my-collection-${c.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {c.coverImage ? (
                        <img src={c.coverImage} alt={c.name} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <FolderOpen className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate" data-testid={`text-name-${c.id}`}>{c.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge className={`text-[10px] ${statusColors[c.status]}`}>
                          {statusLabels[c.status] || c.status}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {c.targetLanguage === "ar" ? "Arab" : "Ingliz"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{c.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {c.lessonCount} ta dars
                    </span>
                    <div className="flex items-center gap-1">
                      {(c.status === "draft" || c.status === "pending" || c.status === "approved") && (
                        <Button
                          size="sm"
                          className="h-7 text-[10px] px-2 bg-gradient-to-r from-primary to-cyan-500"
                          onClick={() => publishMutation.mutate({ id: c.id, status: "published" })}
                          data-testid={`button-publish-${c.id}`}
                        >
                          <Globe className="w-3 h-3 mr-1" />
                          E'lon qilish
                        </Button>
                      )}
                      {c.status === "published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2 border-orange-500/30 text-orange-400"
                          onClick={() => publishMutation.mutate({ id: c.id, status: "approved" })}
                          data-testid={`button-hide-${c.id}`}
                        >
                          <EyeOff className="w-3 h-3 mr-1" />
                          Yashirish
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openManage(c)} data-testid={`button-manage-${c.id}`}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`button-edit-${c.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)} data-testid={`button-delete-${c.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yangi papka yaratish</DialogTitle>
            </DialogHeader>
            {collectionFormJSX}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Bekor qilish</Button>
              <Button onClick={handleCreate} disabled={!formName || createMutation.isPending} data-testid="button-save-create">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Yaratish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Papkani tahrirlash</DialogTitle>
            </DialogHeader>
            {collectionFormJSX}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Bekor qilish</Button>
              <Button onClick={handleUpdate} disabled={!formName || updateMutation.isPending} data-testid="button-save-update">
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Saqlash
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Papka darslari</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {collectionDetail?.lessons && collectionDetail.lessons.length > 0 ? (
                [...collectionDetail.lessons].sort((a, b) => a.orderIndex - b.orderIndex).map((l, idx, arr) => (
                  <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/50" data-testid={`lesson-item-${l.id}`}>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        disabled={idx === 0 || reorderMutation.isPending}
                        onClick={() => moveLessonOrder(l.id, "up")}
                        data-testid={`button-move-up-${l.id}`}
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <span className="text-[10px] font-mono text-muted-foreground text-center">{idx + 1}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        disabled={idx === arr.length - 1 || reorderMutation.isPending}
                        onClick={() => moveLessonOrder(l.id, "down")}
                        data-testid={`button-move-down-${l.id}`}
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>
                    {l.thumbnailUrl && (
                      <img src={l.thumbnailUrl} alt="" className="w-16 h-10 rounded object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{l.title}</p>
                      <p className="text-[10px] text-muted-foreground">{levelLabels[l.level] || l.level}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => selectedCollection && removeLessonMutation.mutate({ collectionId: selectedCollection, lessonId: l.id })}
                      data-testid={`button-remove-lesson-${l.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Bu papkada hali darslar yo'q</p>
              )}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setAddLessonOpen(true)}
                data-testid="button-add-lesson"
              >
                <Plus className="w-4 h-4" />
                Dars qo'shish
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addLessonOpen} onOpenChange={setAddLessonOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dars qo'shish</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Dars qidirish..."
                  value={lessonSearch}
                  onChange={(e) => setLessonSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-lesson"
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 scrollbar-thin">
                {availableLessons.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Qo'shiladigan darslar topilmadi</p>
                ) : (
                  availableLessons.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-card/80 cursor-pointer border border-border/30"
                      onClick={() => selectedCollection && addLessonMutation.mutate({ collectionId: selectedCollection, lessonId: l.id })}
                      data-testid={`available-lesson-${l.id}`}
                    >
                      {l.thumbnailUrl && (
                        <img src={l.thumbnailUrl} alt="" className="w-14 h-9 rounded object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.title}</p>
                        <p className="text-[10px] text-muted-foreground">{levelLabels[l.level] || l.level}</p>
                      </div>
                      <Plus className="w-4 h-4 text-primary shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Papkani o'chirish</AlertDialogTitle>
              <AlertDialogDescription>Haqiqatan ham bu papkani o'chirmoqchimisiz? Darslar o'chirilmaydi, faqat papka olib tashlanadi.</AlertDialogDescription>
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
    </UserLayout>
  );
}
