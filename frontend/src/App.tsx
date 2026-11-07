import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import RequireRole from "./auth/RequireRole";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Each role's screens load only when needed, so an officer never downloads the manager dashboard.

const OfficerLayout = lazy(() => import("./officer/OfficerLayout"));
const LoanList = lazy(() => import("./officer/LoanList"));
const LoanDetail = lazy(() => import("./officer/LoanDetail"));
const ManagerLayout = lazy(() => import("./manager/ManagerLayout"));
const Dashboard = lazy(() => import("./manager/Dashboard"));
const ImportPage = lazy(() => import("./manager/ImportPage"));
const Promises = lazy(() => import("./manager/Promises"));
const Activity = lazy(() => import("./manager/Activity"));
const Loans = lazy(() => import("./manager/Loans"));

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
          <Route path="/officer" element={<OfficerLayout />}>
            <Route index element={<LoanList />} />
            <Route path="loans/:loanId" element={<LoanDetail />} />
          </Route>
        </Route>
        <Route element={<RequireRole role="manager" />}>
          <Route path="/manager" element={<ManagerLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="loans" element={<Loans />} />
            <Route path="promises" element={<Promises />} />
            <Route path="activity" element={<Activity />} />
            <Route path="import" element={<ImportPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
