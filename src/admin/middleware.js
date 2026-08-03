import { findUserById } from "../db.js";
import { isAdminRole } from "../auth/roles.js";

export function requireAdmin(sessionManager) {
  return async (req, res, next) => {
    const session = await sessionManager.readSession(req);
    if (!session || session.type !== "user" || !isAdminRole(session.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const user = await findUserById(session.userId);
    if (!user || !user.is_active) {
      await sessionManager.destroySession(req, res);
      return res.status(403).json({ message: "Admin access required" });
    }

    req.adminUser = user;
    next();
  };
}
