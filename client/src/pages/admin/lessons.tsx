import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function AdminLessonsPage() {
  return (
    <AdminLayout title="Darslar" subtitle="Barcha darslarni boshqaring">
      <Card className="glass border-border/50" data-testid="card-admin-lessons">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-green-500/10 flex items-center justify-center mb-6">
              <BookOpen className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Darslar boshqaruvi</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Barcha darslarni ko'rish, tahrirlash, o'chirish va moderatsiya qilish imkoniyati.
              Darslar ro'yxati va batafsil boshqaruv tez orada qo'shiladi.
            </p>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
