import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function MyLessonsPage() {
  return (
    <UserLayout title="Mening darslarim" subtitle="Barcha darslaringiz bir joyda">
      <Card className="glass border-border/50" data-testid="card-my-lessons">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center mb-6">
              <BookOpen className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Darslar ro'yxati</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Bu yerda siz yaratgan va o'rganayotgan darslar ko'rsatiladi.
              Yangi dars yaratish uchun "Dars yaratish" sahifasiga o'ting.
            </p>
          </div>
        </CardContent>
      </Card>
    </UserLayout>
  );
}
