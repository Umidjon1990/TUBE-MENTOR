import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <AdminLayout title="Sozlamalar" subtitle="Tizim sozlamalarini boshqaring">
      <Card className="glass border-border/50" data-testid="card-admin-settings">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-500/10 to-gray-500/10 flex items-center justify-center mb-6">
              <Settings className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Tizim sozlamalari</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Platformaning asosiy sozlamalari, AI konfiguratsiyasi va tizim
              parametrlarini boshqarish imkoniyati tez orada qo'shiladi.
            </p>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
