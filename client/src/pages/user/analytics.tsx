import UserLayout from "@/components/layouts/user-layout";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <UserLayout title="Tahlil" subtitle="O'rganish jarayoningizni kuzating">
      <Card className="glass border-border/50" data-testid="card-analytics">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-6">
              <BarChart3 className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">O'rganish tahlili</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Darslarni tugatish foizi, o'rganilgan so'zlar soni, o'qish vaqti va
              boshqa ko'rsatkichlar bu yerda ko'rsatiladi.
            </p>
          </div>
        </CardContent>
      </Card>
    </UserLayout>
  );
}
