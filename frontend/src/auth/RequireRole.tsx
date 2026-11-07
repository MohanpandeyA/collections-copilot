import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Role } from "./session";

/** Sends signed-out users to login and users of the wrong role to their own home.
 *  This is only for a tidy UI. The API enforces the real access rules. */
export default function RequireRole({ role }: { role: Role }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={session.role === "manager" ? "/manager" : "/officer"} replace />;
  return <Outlet />;
}
