import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth";
import { Toaster } from "./components/ui";
// 首屏页面直接打包，其余页面按路由懒加载，首屏 JS 体积约为原来的 1/3
import Dashboard from "./pages/Dashboard";

const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const Jobs = lazy(() => import("./pages/Jobs"));
const Todos = lazy(() => import("./pages/Todos"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Store = lazy(() => import("./pages/Store"));
const Ideas = lazy(() => import("./pages/Ideas"));
const Fitness = lazy(() => import("./pages/Fitness"));
const Habits = lazy(() => import("./pages/Habits"));
const Reading = lazy(() => import("./pages/Reading"));
const Weight = lazy(() => import("./pages/Weight"));
const Sleep = lazy(() => import("./pages/Sleep"));
const Subs = lazy(() => import("./pages/Subs"));
const Expiry = lazy(() => import("./pages/Expiry"));
const Accounts = lazy(() => import("./pages/Accounts"));
const Wishes = lazy(() => import("./pages/Wishes"));
const Trips = lazy(() => import("./pages/Trips"));
const Recipes = lazy(() => import("./pages/Recipes"));
const Feedback = lazy(() => import("./pages/Feedback"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Notes = lazy(() => import("./pages/Notes"));
const Timeline = lazy(() => import("./pages/Timeline"));
const Report = lazy(() => import("./pages/Report"));
const Settings = lazy(() => import("./pages/Settings"));
const ApiDoc = lazy(() => import("./pages/ApiDoc"));

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-slate-400">
      正在打开…
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster />
      <HashRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kb" element={<KnowledgeBase />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/store" element={<Store />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/fitness" element={<Fitness />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/reading" element={<Reading />} />
            <Route path="/weight" element={<Weight />} />
            <Route path="/sleep" element={<Sleep />} />
            <Route path="/subs" element={<Subs />} />
            <Route path="/expiry" element={<Expiry />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/wishes" element={<Wishes />} />
            <Route path="/trips" element={<Trips />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/report" element={<Report />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/api-doc" element={<ApiDoc />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </AuthProvider>
  );
}
