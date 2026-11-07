import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import RequireRole from "./auth/RequireRole";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Each role's screens load only when needed, so an officer never downloads the manager dashboard.
const Home = lazy(() => import("./pages/Placeholder"));

function Start() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={session.role === "manager" ? "/manager" : "/officer"} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 48, margin: 16 }} aria-hidden="true" />}>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/login" element={<Login />} />
        <Route element={<RequireRole role="officer" />}>
          <Route path="/officer" element={<Home titleKey="officerHome" />} />
        </Route>
        <Route element={<RequireRole role="manager" />}>
          <Route path="/manager" element={<Home titleKey="managerHome" />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
