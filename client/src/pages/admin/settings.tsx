import { useState, useEffect } from "react";
import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Coins,
  RefreshCw,
  FileDown,
  FileText,
  Star,
  GraduationCap,
  Save,
  Loader2,
} from "lucide-react";

interface SettingConfig {
  key: string;
  label: string;
  description: string;
  icon: typeof Coins;
  type: "number" | "select";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

const settingsConfig: SettingConfig[] = [
  {
    key: "lesson_creation_cost",
    label: "Dars yaratish narxi",
    description: "Yangi dars yaratish uchun kerak bo'ladigan coin miqdori",
    icon: Coins,
    type: "number",
    min: 0,
    max: 1000,
  },
  {
    key: "regenerate_cost",
    label: "Qayta generatsiya narxi",
    description: "AI kontentni qayta generatsiya qilish uchun coin narxi",
    icon: RefreshCw,
    type: "number",
    min: 0,
    max: 500,
  },
  {
    key: "export_cost",
    label: "Eksport narxi",
    description: "Darsni eksport qilish uchun coin narxi",
    icon: FileDown,
    type: "number",
    min: 0,
    max: 500,
  },
  {
    key: "max_transcript_length",
    label: "Maksimal transkript uzunligi",
    description: "YouTube transkriptning maksimal belgilar soni",
    icon: FileText,
    type: "number",
    min: 1000,
    max: 50000,
  },
  {
    key: "featured_lesson_count",
    label: "Tanlangan darslar soni",
    description: "Bosh sahifada ko'rsatiladigan tanlangan darslar soni",
    icon: Star,
    type: "number",
    min: 1,
    max: 50,
  },
  {
    key: "default_difficulty",
    label: "Standart qiyinlik darajasi",
    description: "Yangi darslar uchun standart qiyinlik darajasi",
    icon: GraduationCap,
    type: "select",
    options: [
      { value: "beginner", label: "Boshlang'ich" },
      { value: "intermediate", label: "O'rta" },
      { value: "advanced", label: "Yuqori" },
    ],
  },
];

const defaultValues: Record<string, string> = {
  lesson_creation_cost: "10",
  regenerate_cost: "5",
  export_cost: "3",
  max_transcript_length: "5000",
  featured_lesson_count: "6",
  default_difficulty: "beginner",
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings"],
  });

  useEffect(() => {
    if (settings) {
      const merged = { ...defaultValues, ...settings };
      setFormValues(merged);
      setHasChanges(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("PUT", "/api/admin/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      setHasChanges(false);
      toast({
        title: "Saqlandi",
        description: "Tizim sozlamalari muvaffaqiyatli yangilandi.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Xatolik",
        description: error.message || "Sozlamalarni saqlashda xatolik yuz berdi.",
        variant: "destructive",
      });
    },
  });

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const toSend: Record<string, string> = {};
    for (const config of settingsConfig) {
      const val = formValues[config.key];
      if (val !== undefined && val !== "") {
        if (config.type === "number") {
          const num = Number(val);
          if (isNaN(num)) {
            toast({
              title: "Xatolik",
              description: `${config.label} uchun raqam kiriting.`,
              variant: "destructive",
            });
            return;
          }
          if (config.min !== undefined && num < config.min) {
            toast({
              title: "Xatolik",
              description: `${config.label} kamida ${config.min} bo'lishi kerak.`,
              variant: "destructive",
            });
            return;
          }
          if (config.max !== undefined && num > config.max) {
            toast({
              title: "Xatolik",
              description: `${config.label} ko'pi bilan ${config.max} bo'lishi kerak.`,
              variant: "destructive",
            });
            return;
          }
        }
        toSend[config.key] = val;
      }
    }
    saveMutation.mutate(toSend);
  };

  const handleReset = () => {
    if (settings) {
      const merged = { ...defaultValues, ...settings };
      setFormValues(merged);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Sozlamalar" subtitle="Tizim sozlamalarini boshqaring">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="glass border-border/50">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-9 w-full mt-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Sozlamalar" subtitle="Tizim sozlamalarini boshqaring">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {settingsConfig.map((config) => {
            const IconComp = config.icon;
            return (
              <Card
                key={config.key}
                className="glass border-border/50"
                data-testid={`card-setting-${config.key}`}
              >
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-500/10 flex items-center justify-center shrink-0">
                    <IconComp className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold" data-testid={`text-setting-label-${config.key}`}>
                      {config.label}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {config.description}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {config.type === "number" ? (
                    <div>
                      <Label htmlFor={config.key} className="sr-only">
                        {config.label}
                      </Label>
                      <Input
                        id={config.key}
                        type="number"
                        min={config.min}
                        max={config.max}
                        value={formValues[config.key] || ""}
                        onChange={(e) => handleChange(config.key, e.target.value)}
                        data-testid={`input-setting-${config.key}`}
                      />
                      {config.min !== undefined && config.max !== undefined && (
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          Diapazoni: {config.min} — {config.max}
                        </p>
                      )}
                    </div>
                  ) : config.type === "select" && config.options ? (
                    <div>
                      <Label htmlFor={config.key} className="sr-only">
                        {config.label}
                      </Label>
                      <Select
                        value={formValues[config.key] || ""}
                        onValueChange={(val) => handleChange(config.key, val)}
                      >
                        <SelectTrigger data-testid={`select-setting-${config.key}`}>
                          <SelectValue placeholder="Tanlang" />
                        </SelectTrigger>
                        <SelectContent>
                          {config.options.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                              data-testid={`option-${config.key}-${opt.value}`}
                            >
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || saveMutation.isPending}
            data-testid="button-reset-settings"
          >
            Bekor qilish
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Saqlash
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
