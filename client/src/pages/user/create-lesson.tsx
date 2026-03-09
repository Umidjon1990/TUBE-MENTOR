import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, Youtube } from "lucide-react";

export default function CreateLessonPage() {
  return (
    <UserLayout title="Dars yaratish" subtitle="YouTube videosidan yangi dars yarating">
      <Card className="glass border-border/50 max-w-2xl" data-testid="card-create-lesson">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/10 to-rose-500/10 flex items-center justify-center mb-6">
              <Youtube className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Yangi dars yaratish</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              YouTube video havolasini kiriting va sun'iy intellekt avtomatik ravishda
              interaktiv dars yaratadi.
            </p>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-cyan-500/10 flex items-center justify-center">
              <PlusCircle className="w-6 h-6 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground mt-4">Tez orada ishga tushiriladi</p>
          </div>
        </CardContent>
      </Card>
    </UserLayout>
  );
}
