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
import LessonProcessPage from "@/pages/user/lesson-process";
import LessonDetailPage from "@/pages/user/lesson-detail";
import MyLessonsPage from "@/pages/user/my-lessons";
import FlashcardsPage from "@/pages/user/flashcards";
import SavedWordsPage from "@/pages/user/saved-words";
import SmartDictionaryPage from "@/pages/user/smart-dictionary";
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
import AdminDataCenterPage from "@/pages/admin/data-center";
import PublicLibraryPage from "@/pages/public-library";
import PublicLessonPage from "@/pages/public-lesson";
import PublicCategoryPage from "@/pages/public-category";
import PublicCollectionPage from "@/pages/public-collection";
import PublicDictionaryPage from "@/pages/public-dictionary";
import ShadowingPage from "@/pages/user/shadowing";
import MyCollectionsPage from "@/pages/user/my-collections";
import AdminCollectionsPage from "@/pages/admin/collections";
import { ProtectedRoute } from "@/components/protected-route";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/library" component={PublicLibraryPage} />
      <Route path="/library/category/:id" component={PublicCategoryPage} />
      <Route path="/library/collection/:id" component={PublicCollectionPage} />
      <Route path="/library/:id" component={PublicLessonPage} />
      <Route path="/smart-dictionary" component={PublicDictionaryPage} />
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
      <Route path="/lessons/:id/process">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <LessonProcessPage />
        </ProtectedRoute>
      </Route>
      <Route path="/lessons/:id/shadowing">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <ShadowingPage />
        </ProtectedRoute>
      </Route>
      <Route path="/lessons/:id">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <LessonDetailPage />
        </ProtectedRoute>
      </Route>
      <Route path="/lessons">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <MyLessonsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/collections">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <MyCollectionsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/flashcards">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <FlashcardsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/saved-words">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <SavedWordsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/dictionary">
        <ProtectedRoute allowedRoles={["student", "teacher"]}>
          <SmartDictionaryPage />
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
      <Route path="/admin/collections">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminCollectionsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/data">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminDataCenterPage />
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
