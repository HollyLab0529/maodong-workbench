import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth";
import { Toaster } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import KnowledgeBase from "./pages/KnowledgeBase";
import Jobs from "./pages/Jobs";
import Todos from "./pages/Todos";
import Calendar from "./pages/Calendar";
import Store from "./pages/Store";
import Ideas from "./pages/Ideas";
import Fitness from "./pages/Fitness";
import Habits from "./pages/Habits";
import Reading from "./pages/Reading";
import Weight from "./pages/Weight";
import Sleep from "./pages/Sleep";
import Subs from "./pages/Subs";
import Expiry from "./pages/Expiry";
import Accounts from "./pages/Accounts";
import Wishes from "./pages/Wishes";
import Trips from "./pages/Trips";
import Recipes from "./pages/Recipes";
import Feedback from "./pages/Feedback";
import Expenses from "./pages/Expenses";
import Notes from "./pages/Notes";
import Timeline from "./pages/Timeline";
import Report from "./pages/Report";
import Settings from "./pages/Settings";
import ApiDoc from "./pages/ApiDoc";

export default function App() {
  return (
    <AuthProvider>
      <Toaster />
      <HashRouter>
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
      </HashRouter>
    </AuthProvider>
  );
}
