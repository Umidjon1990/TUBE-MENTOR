import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold" data-testid="text-404-title">
              404 - Sahifa topilmadi
            </h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground" data-testid="text-404-description">
            Siz qidirayotgan sahifa mavjud emas yoki ko'chirilgan bo'lishi mumkin.
          </p>
          <Link href="/">
            <Button variant="outline" className="mt-6" data-testid="button-go-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Bosh sahifaga qaytish
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
