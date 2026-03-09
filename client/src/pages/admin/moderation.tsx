import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default function AdminModerationPage() {
  return (
    <AdminLayout title="Moderatsiya" subtitle="Kontentni nazorat qiling">
      <Card className="glass border-border/50" data-testid="card-admin-moderation">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center mb-6">
              <ShieldCheck className="w-10 h-10 text-amber-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Moderatsiya paneli</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Foydalanuvchilar tomonidan yaratilgan darslar va kontentni tekshirish,
              tasdiqlash yoki rad etish imkoniyati tez orada qo'shiladi.
            </p>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
