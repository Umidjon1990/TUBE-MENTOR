import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Coins } from "lucide-react";

export default function AdminCoinsPage() {
  return (
    <AdminLayout title="Coin boshqaruvi" subtitle="Tanga tizimini boshqaring">
      <Card className="glass border-border/50" data-testid="card-admin-coins">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 flex items-center justify-center mb-6">
              <Coins className="w-10 h-10 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Coin boshqaruvi</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Foydalanuvchilarga tanga qo'shish, ayirish va tanga tranzaksiyalar
              tarixini ko'rish imkoniyati tez orada qo'shiladi.
            </p>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
