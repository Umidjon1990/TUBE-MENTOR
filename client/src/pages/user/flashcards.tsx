import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Layers } from "lucide-react";

export default function FlashcardsPage() {
  return (
    <UserLayout title="Kartochkalar" subtitle="Flashcard orqali so'zlarni o'rganing">
      <Card className="glass border-border/50" data-testid="card-flashcards">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center mb-6">
              <Layers className="w-10 h-10 text-amber-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Flashcard kartochkalar</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Darslardan olingan so'z va iboralar kartochkalar shaklida ko'rsatiladi.
              Takroriy o'rganish tizimi bilan bilimlaringizni mustahkamlang.
            </p>
          </div>
        </CardContent>
      </Card>
    </UserLayout>
  );
}
