import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 gradient-mesh" />
      <div className="relative text-center">
        <h1 className="text-7xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-4" data-testid="text-404-title">404</h1>
        <p className="text-xl font-semibold mb-2">Sahifa topilmadi</p>
        <p className="text-sm text-muted-foreground mb-8" data-testid="text-404-description">
          Siz qidirayotgan sahifa mavjud emas yoki ko'chirilgan.
        </p>
        <Link href="/">
          <Button className="bg-gradient-to-r from-primary to-cyan-500 shadow-lg shadow-primary/20" data-testid="button-go-home">
            <Home className="w-4 h-4 mr-2" />
            Bosh sahifaga qaytish
          </Button>
        </Link>
      </div>
    </div>
  );
}
