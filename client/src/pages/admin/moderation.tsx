import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Category, Tag } from "@shared/schema";
import {
  ShieldCheck,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  Globe,
  GlobeLock,
  Star,
  BookOpen,
  Clock,
  User,
  FileText,
  Tag as TagIcon,
  FolderTree,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

type LessonWithMeta = {
  id: number;
  title: string;
  description: string | null;
  youtubeUrl: string | null;
  thumbnailUrl: string | null;
  transcript: string | null;
  level: string;
  status: string;
  categoryId: number | null;
  summaryShort: string | null;
  summaryDetailed: string | null;
  vocabularyJson: unknown;
  phrasesJson: unknown;
  quizzesJson: unknown;
  flashcardsJson: unknown;
  moderationNote: string | null;
  isFeatured: boolean;
  createdBy: string | null;
  approvedBy: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  creatorName: string;
  creatorUsername: string;
  tags: Tag[];
};

type LessonDetail = LessonWithMeta & {
  allCategories: Category[];
  allTags: Tag[];
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  draft: { label: "Qoralama", variant: "secondary", className: "bg-muted/80 text-muted-foreground" },
  pending: { label: "Kutilmoqda", variant: "outline", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  approved: { label: "Tasdiqlangan", variant: "outline", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  published: { label: "E'lon qilingan", variant: "outline", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  rejected: { label: "Rad etilgan", variant: "destructive", className: "bg-red-500/10 text-red-500 border-red-500/20" },
};

const LEVEL_MAP: Record<string, string> = {
  beginner: "Boshlang'ich",
  intermediate: "O'rta",
  advanced: "Yuqori",
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <Badge variant={config.variant} className={config.className} data-testid={`badge-status-${status}`}>
      {config.label}
    </Badge>
  );
}

export default function AdminModerationPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moderationNote, setModerationNote] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);

  const { data: lessons, isLoading, isError } = useQuery<LessonWithMeta[]>({
    queryKey: ["/api/admin/lessons"],
  });

  const { data: lessonDetail, isLoading: detailLoading } = useQuery<LessonDetail>({
    queryKey: ["/api/admin/lessons", selectedLessonId],
    enabled: !!selectedLessonId && detailOpen,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: number; note?: string }) => {
      await apiRequest("PATCH", `/api/admin/lessons/${id}/approve`, { moderationNote: note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons"] });
      toast({ title: "Dars tasdiqlandi" });
      setDetailOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      await apiRequest("PATCH", `/api/admin/lessons/${id}/reject`, { moderationNote: note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons"] });
      toast({ title: "Dars rad etildi" });
      setDetailOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/admin/lessons/${id}/publish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons"] });
      toast({ title: "Dars e'lon qilindi" });
      setDetailOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/admin/lessons/${id}/unpublish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons"] });
      toast({ title: "Dars e'londan olindi" });
      setDetailOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const updateLessonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/admin/lessons/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons"] });
      toast({ title: "Dars yangilandi" });
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const updateTagsMutation = useMutation({
    mutationFn: async ({ id, tagIds }: { id: number; tagIds: number[] }) => {
      await apiRequest("PUT", `/api/admin/lessons/${id}/tags`, { tagIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons"] });
      toast({ title: "Teglar yangilandi" });
    },
    onError: (err: Error) => {
      toast({ title: "Xatolik", description: err.message, variant: "destructive" });
    },
  });

  const filteredLessons = (lessons || []).filter((lesson) => {
    if (statusFilter !== "all" && lesson.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        lesson.title.toLowerCase().includes(q) ||
        lesson.creatorName.toLowerCase().includes(q) ||
        lesson.creatorUsername.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const statusCounts = (lessons || []).reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      acc.all += 1;
      return acc;
    },
    { all: 0 } as Record<string, number>
  );

  function openDetail(lesson: LessonWithMeta) {
    setSelectedLessonId(lesson.id);
    setModerationNote(lesson.moderationNote || "");
    setIsFeatured(lesson.isFeatured);
    setSelectedCategoryId(lesson.categoryId?.toString() || "");
    setSelectedTagIds(lesson.tags.map((t) => t.id));
    setDetailOpen(true);
  }

  function handleSaveMetadata() {
    if (!selectedLessonId) return;
    updateLessonMutation.mutate({
      id: selectedLessonId,
      data: {
        moderationNote,
        isFeatured,
        categoryId: selectedCategoryId && selectedCategoryId !== "none" ? parseInt(selectedCategoryId) : null,
      },
    });
    updateTagsMutation.mutate({ id: selectedLessonId, tagIds: selectedTagIds });
  }

  const anyActionPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending ||
    updateLessonMutation.isPending ||
    updateTagsMutation.isPending;

  return (
    <AdminLayout title="Moderatsiya" subtitle="Kontentni nazorat qiling">
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(["all", "pending", "approved", "published", "rejected"] as const).map((key) => {
            const isActive = statusFilter === key;
            const label = key === "all" ? "Hammasi" : (STATUS_MAP[key]?.label || key);
            return (
              <Card
                key={key}
                className={`glass border-border/50 cursor-pointer transition-all ${isActive ? "ring-1 ring-violet-500/40" : ""}`}
                onClick={() => setStatusFilter(key)}
                data-testid={`card-filter-${key}`}
              >
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold" data-testid={`text-count-${key}`}>
                    {statusCounts[key] || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="glass border-border/50">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <CardTitle className="flex items-center gap-2 text-base flex-wrap">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              Darslar ro'yxati
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-lessons"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isError ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6" data-testid="error-state">
                <BookOpen className="w-10 h-10 text-destructive/50 mb-4" />
                <p className="text-sm text-muted-foreground mb-3">Darslarni yuklashda xatolik</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()} data-testid="button-retry">
                  Qayta yuklash
                </Button>
              </div>
            ) : isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredLessons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <BookOpen className="w-10 h-10 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">Darslar topilmadi</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="flex items-center gap-4 px-6 py-4 hover-elevate cursor-pointer"
                    onClick={() => openDetail(lesson)}
                    data-testid={`row-lesson-${lesson.id}`}
                  >
                    <div className="w-16 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                      {lesson.thumbnailUrl ? (
                        <img
                          src={lesson.thumbnailUrl}
                          alt={lesson.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate" data-testid={`text-lesson-title-${lesson.id}`}>
                          {lesson.title}
                        </p>
                        {lesson.isFeatured && (
                          <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {lesson.creatorName}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(lesson.createdAt).toLocaleDateString("uz")}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {LEVEL_MAP[lesson.level] || lesson.level}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={lesson.status} />
                      <Button variant="ghost" size="icon" data-testid={`button-view-lesson-${lesson.id}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailLoading || !lessonDetail ? (
            <div className="space-y-4 p-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap" data-testid="text-detail-title">
                  {lessonDetail.title}
                  {lessonDetail.isFeatured && <Star className="w-4 h-4 text-amber-500" />}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusBadge status={lessonDetail.status} />
                  <Badge variant="secondary" className="text-xs">
                    {LEVEL_MAP[lessonDetail.level] || lessonDetail.level}
                  </Badge>
                  {lessonDetail.youtubeUrl && (
                    <a
                      href={lessonDetail.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground flex items-center gap-1"
                      data-testid="link-youtube"
                    >
                      <ExternalLink className="w-3 h-3" />
                      YouTube
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-violet-500/10 text-violet-400 text-xs">
                      {lessonDetail.creatorName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium" data-testid="text-detail-creator">
                      {lessonDetail.creatorName}
                    </p>
                    <p className="text-xs text-muted-foreground">@{lessonDetail.creatorUsername}</p>
                  </div>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(lessonDetail.createdAt).toLocaleString("uz")}
                  </span>
                </div>

                {lessonDetail.summaryShort && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      <FileText className="w-3 h-3 inline mr-1" />
                      Qisqacha xulosa
                    </Label>
                    <p className="text-sm" data-testid="text-detail-summary">{lessonDetail.summaryShort}</p>
                  </div>
                )}

                {lessonDetail.thumbnailUrl && (
                  <div className="rounded-md overflow-hidden">
                    <img
                      src={lessonDetail.thumbnailUrl}
                      alt={lessonDetail.title}
                      className="w-full h-48 object-cover"
                    />
                  </div>
                )}

                <div className="space-y-3 border-t border-border/50 pt-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                    Moderatsiya
                  </h3>

                  <div>
                    <Label htmlFor="mod-note" className="text-xs text-muted-foreground mb-1 block">
                      Moderatsiya izohi
                    </Label>
                    <Textarea
                      id="mod-note"
                      value={moderationNote}
                      onChange={(e) => setModerationNote(e.target.value)}
                      placeholder="Izoh yozing..."
                      className="text-sm"
                      data-testid="textarea-moderation-note"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      id="featured"
                      checked={isFeatured}
                      onCheckedChange={setIsFeatured}
                      data-testid="switch-featured"
                    />
                    <Label htmlFor="featured" className="text-sm flex items-center gap-1.5 cursor-pointer">
                      <Star className="w-4 h-4 text-amber-500" />
                      Tanlangan dars
                    </Label>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      <FolderTree className="w-3 h-3 inline mr-1" />
                      Kategoriya
                    </Label>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={setSelectedCategoryId}
                    >
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Kategoriya tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kategoriyasiz</SelectItem>
                        {(lessonDetail.allCategories || []).map((cat) => (
                          <SelectItem key={cat.id} value={cat.id.toString()}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      <TagIcon className="w-3 h-3 inline mr-1" />
                      Teglar
                    </Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(lessonDetail.allTags || []).map((tag) => {
                        const isSelected = selectedTagIds.includes(tag.id);
                        return (
                          <Badge
                            key={tag.id}
                            variant={isSelected ? "default" : "outline"}
                            className={`cursor-pointer toggle-elevate ${isSelected ? "toggle-elevated" : ""}`}
                            onClick={() => {
                              setSelectedTagIds((prev) =>
                                isSelected
                                  ? prev.filter((id) => id !== tag.id)
                                  : [...prev, tag.id]
                              );
                            }}
                            data-testid={`badge-tag-${tag.id}`}
                          >
                            {tag.name}
                          </Badge>
                        );
                      })}
                      {(lessonDetail.allTags || []).length === 0 && (
                        <p className="text-xs text-muted-foreground">Teglar mavjud emas</p>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={handleSaveMetadata}
                    disabled={anyActionPending}
                    className="w-full"
                    data-testid="button-save-metadata"
                  >
                    Saqlash
                  </Button>
                </div>

                <div className="border-t border-border/50 pt-4 space-y-2">
                  <h3 className="text-sm font-semibold mb-3">Harakatlar</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(lessonDetail.status === "pending" || lessonDetail.status === "draft") && (
                      <>
                        <Button
                          onClick={() => {
                            approveMutation.mutate({ id: lessonDetail.id, note: moderationNote || undefined });
                          }}
                          disabled={anyActionPending}
                          className="bg-emerald-600 text-white border-emerald-600"
                          data-testid="button-approve"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          Tasdiqlash
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => {
                            if (!moderationNote.trim()) {
                              toast({
                                title: "Izoh majburiy",
                                description: "Rad etish uchun izoh yozing",
                                variant: "destructive",
                              });
                              return;
                            }
                            rejectMutation.mutate({ id: lessonDetail.id, note: moderationNote });
                          }}
                          disabled={anyActionPending}
                          data-testid="button-reject"
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          Rad etish
                        </Button>
                      </>
                    )}
                    {lessonDetail.status === "approved" && (
                      <Button
                        onClick={() => publishMutation.mutate(lessonDetail.id)}
                        disabled={anyActionPending}
                        className="bg-blue-600 text-white border-blue-600 col-span-2"
                        data-testid="button-publish"
                      >
                        <Globe className="w-4 h-4 mr-1.5" />
                        E'lon qilish
                      </Button>
                    )}
                    {lessonDetail.status === "published" && (
                      <Button
                        variant="outline"
                        onClick={() => unpublishMutation.mutate(lessonDetail.id)}
                        disabled={anyActionPending}
                        className="col-span-2"
                        data-testid="button-unpublish"
                      >
                        <GlobeLock className="w-4 h-4 mr-1.5" />
                        E'londan olish
                      </Button>
                    )}
                    {lessonDetail.status === "rejected" && (
                      <Button
                        onClick={() => {
                          approveMutation.mutate({ id: lessonDetail.id, note: moderationNote || undefined });
                        }}
                        disabled={anyActionPending}
                        className="bg-emerald-600 text-white border-emerald-600 col-span-2"
                        data-testid="button-reapprove"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Qayta tasdiqlash
                      </Button>
                    )}
                  </div>
                  {lessonDetail.moderationNote && lessonDetail.moderationNote !== moderationNote && (
                    <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/10 rounded-md p-3 mt-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-amber-500">Oldingi izoh</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{lessonDetail.moderationNote}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
