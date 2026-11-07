import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Analytics from "./pages/Analytics";
import Home from "./pages/Home";
import Github from "./pages/Github";
import Leetcode from "./pages/Leetcode";
import Linkedin from "./pages/Linkedin";
import FullScore from "./pages/FullScore";
import Compare from "./pages/Compare";
import History from "./pages/History";
import Settings from "./pages/Settings";
import ResumeAI from "./pages/ResumeAI";
import Search from "./pages/Search";
import Admin from "./pages/Admin";
import ProtectedRoute from "./components/ProtectedRoute";
import EResume from "./pages/EResume";
import PublicResume from "./pages/PublicResume";

export default function App() {
  return (
    <Routes>
      {/* Public e-resume pages stand alone, without the app's sidebar and navbar */}
      <Route path="/r/:slug" element={<PublicResume />} />
      <Route path="*" element={<AppRoutes />} />
    </Routes>
  );
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/" element={<Home />} />
        <Route path="/eresume" element={<EResume />} />
        <Route path="/resume" element={<ProtectedRoute><ResumeAI /></ProtectedRoute>} />
        <Route path="/github" element={<Github />} />
        <Route path="/leetcode" element={<Leetcode />} />
        <Route path="/linkedin" element={<Linkedin />} />
        <Route path="/full" element={<ProtectedRoute><FullScore /></ProtectedRoute>} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/search" element={<Search />} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
      </Routes>
    </Layout>
  );
}
