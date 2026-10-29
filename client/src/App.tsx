import { lazy, Suspense, type ReactNode } from "react";
import { Switch, Route, Redirect, useParams } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loading } from "@/components/learning-shell";
import {
  LandingPage,
  LoginPage,
  RegisterPage,
  VerificationPage,
  PasswordRecoveryPage,
  OnboardingPage,
} from "@/pages/learning/auth-pages";
const learner = () => import("@/pages/learning/learner-pages");
const Today = lazy(() => learner().then((m) => ({ default: m.TodayPage })));
const Catalog = lazy(() => learner().then((m) => ({ default: m.CatalogPage })));
const Course = lazy(() => learner().then((m) => ({ default: m.CoursePage })));
const Words = lazy(() => learner().then((m) => ({ default: m.WordsPage })));
const Review = lazy(() => learner().then((m) => ({ default: m.ReviewPage })));
const Profile = lazy(() => learner().then((m) => ({ default: m.ProfilePage })));
const Lesson = lazy(() => import("@/pages/learning/experience-page"));
const Trial=lazy(()=>import('@/pages/learning/trial-page'));
const ExperienceReview=lazy(()=>import('@/pages/learning/experience-page').then(m=>({default:m.DailyReviewPage})));
const studio = () => import("@/pages/learning/studio-pages");
const Studio = lazy(() => studio().then((m) => ({ default: m.StudioPage })));
const Create = lazy(() =>
  studio().then((m) => ({ default: m.CreateStudioLesson })),
);
const Editor = lazy(() => studio().then((m) => ({ default: m.StudioEditor })));
const StudioCourses = lazy(() =>
  studio().then((m) => ({ default: m.StudioCourses })),
);
const StudioCourse = lazy(() =>
  studio().then((m) => ({ default: m.StudioCourseEditor })),
);
const Moderation = lazy(() =>
  studio().then((m) => ({ default: m.ModerationPage })),
);
const Notes = lazy(() => import("@/pages/user/notes"));
const ArchivedCards = lazy(() => import("@/pages/user/flashcards"));
const Process = lazy(() => import("@/pages/user/lesson-process"));
const Advanced = lazy(() => import("@/pages/user/lesson-detail"));
const Dictionary = lazy(() => import("@/pages/public-dictionary"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminLessons = Studio;
const commerce = () => import("@/pages/learning/commerce-pages");
const Wallet = lazy(() => commerce().then(m => ({ default: m.WalletPage })));
const PaymentOrder = lazy(() => commerce().then(m => ({ default: m.PaymentOrderPage })));
const MyLessons = lazy(() => commerce().then(m => ({ default: m.MyLessonsPage })));
const Support = lazy(() => commerce().then(m => ({ default: m.SupportPage })));
const SupportTicket = lazy(() => commerce().then(m => ({ default: m.SupportTicketPage })));
const adminCommerce = () => import("@/pages/admin/commerce");
const CommerceDashboard = lazy(() => adminCommerce().then(m => ({ default: m.AdminCommerceDashboard })));
const PaymentOrders = lazy(() => adminCommerce().then(m => ({ default: m.AdminPaymentOrders })));
const AdminPaymentOrder = lazy(() => adminCommerce().then(m => ({ default: m.AdminPaymentOrder })));
const CoinPackages = lazy(() => adminCommerce().then(m => ({ default: m.AdminCoinPackages })));
const CommerceSettings = lazy(() => adminCommerce().then(m => ({ default: m.AdminCommerceSettings })));
const CommerceAudit = lazy(() => adminCommerce().then(m => ({ default: m.AdminCommerceAudit })));
const AdminSupport = lazy(() => adminCommerce().then(m => ({ default: m.AdminSupportPage })));
const AdminSupportTicket = lazy(() => adminCommerce().then(m => ({ default: m.AdminSupportTicketPage })));
const AdminCoins = lazy(() => import("@/pages/admin/coins"));
const AdminCategories = lazy(() => import("@/pages/admin/categories"));
const AdminSettings = lazy(() => import("@/pages/admin/settings"));
const AdminData = lazy(() => import("@/pages/admin/data-center"));
const AdminCollections = lazy(() => import("@/pages/admin/collections"));
function Guard({
  children,
  roles,
  onboarding = false,
}: {
  children: ReactNode;
  roles?: string[];
  onboarding?: boolean;
}) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!user)
    return (
      <Redirect
        to={`/login?next=${encodeURIComponent(window.location.pathname)}`}
      />
    );
  if (roles && !roles.includes(user.role))
    return (
      <Redirect
        to={
          user.role === "admin"
            ? "/admin"
            : "/today"
        }
      />
    );
  if (onboarding && user.role === "student" && !user.onboardingCompleted)
    return <Redirect to="/onboarding" />;
  return <>{children}</>;
}
function LegacyLesson() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading } = useAuth();
  return isLoading ? (
    <Loading />
  ) : (
    <Redirect
      to={
        user?.role === "admin"
          ? `/admin/lessons/${id}`
          : `/learn/${id}`
      }
    />
  );
}
function AliasCourse() {
  const { id } = useParams<{ id: string }>();
  return <Redirect to={`/courses/${id}`} />;
}
function AliasLesson() {
  const { id } = useParams<{ id: string }>();
  return <Redirect to={`/learn/${id}`} />;
}
function Router() {
  return (
    <Suspense fallback={<Loading />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/verify-email" component={VerificationPage} />
        <Route path="/forgot-password">
          <PasswordRecoveryPage />
        </Route>
        <Route path="/reset-password">
          <PasswordRecoveryPage reset />
        </Route>
        <Route path="/onboarding">
          <Guard>
            <OnboardingPage />
          </Guard>
        </Route>
        <Route path="/today">
          <Guard onboarding>
            <Today />
          </Guard>
        </Route>
        <Route path="/courses" component={Catalog} />
        <Route path="/courses/:id" component={Course} />
        <Route path="/trial/:id" component={Trial} />
        <Route path="/learn/:id" component={Lesson} />
        <Route path="/review/experience"><Guard><ExperienceReview/></Guard></Route>
        <Route path="/support"><Guard><Support /></Guard></Route>
        <Route path="/support/:id"><Guard><SupportTicket /></Guard></Route>
        <Route path="/wallet"><Guard><Wallet /></Guard></Route>
        <Route path="/payments/:id"><Guard><PaymentOrder /></Guard></Route>
        <Route path="/my-lessons"><Guard><MyLessons /></Guard></Route>
        <Route path="/words">
          <Guard onboarding>
            <Words />
          </Guard>
        </Route>
        <Route path="/review">
          <Guard onboarding>
            <Review />
          </Guard>
        </Route>
        <Route path="/profile">
          <Guard>
            <Profile />
          </Guard>
        </Route>
        <Route path="/studio">
          <Guard roles={["admin"]}>
            <Studio />
          </Guard>
        </Route>
        <Route path="/studio/new">
          <Guard roles={["admin"]}>
            <Create />
          </Guard>
        </Route>
        <Route path="/studio/lessons/:id">
          <Guard roles={["admin"]}>
            <Editor />
          </Guard>
        </Route>
        <Route path="/studio/courses">
          <Guard roles={["admin"]}>
            <StudioCourses />
          </Guard>
        </Route>
        <Route path="/studio/courses/:id">
          <Guard roles={["admin"]}>
            <StudioCourse />
          </Guard>
        </Route>
        <Route path="/lessons/:id/process">
          <Guard roles={["admin"]}>
            <Process />
          </Guard>
        </Route>
        <Route path="/lessons/:id/advanced">
          <Guard roles={["admin"]}>
            <Advanced />
          </Guard>
        </Route>
        <Route path="/lessons/create">
          <Redirect to="/admin/lessons/new" />
        </Route>
        <Route path="/lessons/:id/shadowing" component={AliasLesson} />
        <Route path="/lessons/:id" component={LegacyLesson} />
        <Route path="/lessons">
          <Redirect to="/admin/lessons" />
        </Route>
        <Route path="/collections">
          <Redirect to="/admin/courses" />
        </Route>
        <Route path="/dashboard">
          <Redirect to="/today" />
        </Route>
        <Route path="/saved-words">
          <Redirect to="/words" />
        </Route>
        <Route path="/flashcards">
          <Redirect to="/review" />
        </Route>
        <Route path="/analytics">
          <Redirect to="/profile" />
        </Route>
        <Route path="/notes">
          <Guard>
            <Notes />
          </Guard>
        </Route>
        <Route path="/flashcards/archive">
          <Guard>
            <ArchivedCards />
          </Guard>
        </Route>
        <Route path="/library">
          <Redirect to={`/courses${window.location.search}`} />
        </Route>
        <Route path="/library/collection/:id" component={AliasCourse} />
        <Route path="/library/category/:id">
          <Redirect to="/courses" />
        </Route>
        <Route path="/library/:id" component={AliasLesson} />
        <Route path="/dictionary" component={Dictionary} />
        <Route path="/smart-dictionary" component={Dictionary} />
        <Route path="/admin">
          <Guard roles={["admin"]}>
            <CommerceDashboard />
          </Guard>
        </Route>
        <Route path="/admin/users">
          <Guard roles={["admin"]}>
            <AdminUsers />
          </Guard>
        </Route>
        <Route path="/admin/lessons/new"><Guard roles={["admin"]}><Create /></Guard></Route>
        <Route path="/admin/lessons/:id"><Guard roles={["admin"]}><Editor /></Guard></Route>
        <Route path="/admin/courses"><Guard roles={["admin"]}><StudioCourses /></Guard></Route>
        <Route path="/admin/courses/:id"><Guard roles={["admin"]}><StudioCourse /></Guard></Route>
        <Route path="/admin/commerce"><Guard roles={["admin"]}><CommerceDashboard /></Guard></Route>
        <Route path="/admin/support"><Guard roles={["admin"]}><AdminSupport /></Guard></Route>
        <Route path="/admin/support/:id"><Guard roles={["admin"]}><AdminSupportTicket /></Guard></Route>
        <Route path="/admin/payments"><Guard roles={["admin"]}><PaymentOrders /></Guard></Route>
        <Route path="/admin/payments/:id"><Guard roles={["admin"]}><AdminPaymentOrder /></Guard></Route>
        <Route path="/admin/packages"><Guard roles={["admin"]}><CoinPackages /></Guard></Route>
        <Route path="/admin/commerce-settings"><Guard roles={["admin"]}><CommerceSettings /></Guard></Route>
        <Route path="/admin/audit"><Guard roles={["admin"]}><CommerceAudit /></Guard></Route>
        <Route path="/admin/lessons">
          <Guard roles={["admin"]}>
            <AdminLessons />
          </Guard>
        </Route>
        <Route path="/admin/moderation">
          <Guard roles={["admin"]}>
            <Moderation />
          </Guard>
        </Route>
        <Route path="/admin/coins">
          <Guard roles={["admin"]}>
            <AdminCoins />
          </Guard>
        </Route>
        <Route path="/admin/categories">
          <Guard roles={["admin"]}>
            <AdminCategories />
          </Guard>
        </Route>
        <Route path="/admin/collections">
          <Guard roles={["admin"]}>
            <Redirect to="/admin/courses" />
          </Guard>
        </Route>
        <Route path="/admin/data">
          <Guard roles={["admin"]}>
            <AdminData />
          </Guard>
        </Route>
        <Route path="/admin/settings">
          <Guard roles={["admin"]}>
            <AdminSettings />
          </Guard>
        </Route>
        <Route>
          <main className="not-found learning-panel">
            <h1>Sahifa topilmadi</h1>
            <a className="primary-link" href="/">
              Bosh sahifaga qaytish
            </a>
          </main>
        </Route>
      </Switch>
    </Suspense>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

import "@/learner-theme.css";
