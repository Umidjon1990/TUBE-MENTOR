import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { StickyNote } from "lucide-react";

export default function NotesPage() {
  return (
    <UserLayout title="Eslatmalar" subtitle="Darslar bo'yicha eslatmalaringiz">
      <Card className="glass border-border/50" data-testid="card-notes">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-green-500/10 flex items-center justify-center mb-6">
              <StickyNote className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Eslatmalar</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Darslar davomida yozgan eslatmalaringiz bu yerda saqlanadi.
              Muhim ma'lumotlarni belgilab qo'ying va tez topishingiz mumkin.
            </p>
          </div>
        </CardContent>
      </Card>
    </UserLayout>
  );
}
