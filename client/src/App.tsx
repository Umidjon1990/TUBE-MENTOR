import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CreateLessonPage from "@/pages/user/create-lesson";
import MyLessonsPage from "@/pages/user/my-lessons";
import FlashcardsPage from "@/pages/user/flashcards";
import NotesPage from "@/pages/user/notes";
import AnalyticsPage from "@/pages/user/analytics";
import ProfilePage from "@/pages/user/profile";
import AdminPage from "@/pages/admin";
import AdminUsersPage from "@/pages/admin/users";
import AdminLessonsPage from "@/pages/admin/lessons";
import AdminModerationPage from "@/pages/admin/moderation";
import AdminCoinsPage from "@/pages/admin/coins";
import AdminCategoriesPage from "@/pages/admin/categories";
import AdminSettingsPage from "@/pages/admin/settings";
import { ProtectedRoute } from "@/components/protected-route";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={LoginPage} />

      <Route path="/dashboard">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <DashboardPage />
        </ProtectedRoute>
      </Route>
      <Route path="/lessons/create">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <CreateLessonPage />
        </ProtectedRoute>
      </Route>
      <Route path="/lessons">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <MyLessonsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/flashcards">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <FlashcardsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/notes">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <NotesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <AnalyticsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <ProfilePage />
        </ProtectedRoute>
      </Route>

      <Route path="/admin">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminUsersPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/lessons">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminLessonsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/moderation">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminModerationPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/coins">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminCoinsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/categories">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminCategoriesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminSettingsPage />
        </ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
