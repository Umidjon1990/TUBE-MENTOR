import AdminLayout from "@/components/layouts/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { FolderTree } from "lucide-react";

export default function AdminCategoriesPage() {
  return (
    <AdminLayout title="Kategoriyalar" subtitle="Dars kategoriyalarini boshqaring">
      <Card className="glass border-border/50" data-testid="card-admin-categories">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-6">
              <FolderTree className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Kategoriyalar boshqaruvi</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Dars kategoriyalarini yaratish, tahrirlash va o'chirish imkoniyati
              tez orada qo'shiladi.
            </p>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
