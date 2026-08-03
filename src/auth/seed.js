import bcrypt from "bcryptjs";
import { createUser, findUserByEmail, findUserByRole, findUserByUsername, updateUser } from "../db.js";
import { ALL_SYSTEMS, ROLES } from "./roles.js";

export async function ensureUltimateUser() {
  const username = process.env.SUPERADMIN_USERNAME;
  const email = process.env.SUPERADMIN_EMAIL?.toLowerCase() || null;
  const password = process.env.SUPERADMIN_PASSWORD;
  const displayName = process.env.SUPERADMIN_DISPLAY_NAME;

  if (!username || !password || !displayName) {
    throw new Error("SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD, SUPERADMIN_DISPLAY_NAME are required");
  }

  let existing = await findUserByUsername(username);
  if (!existing && email) existing = await findUserByEmail(email);
  if (!existing) existing = await findUserByRole(ROLES.ULTIMATE);

  if (!existing) {
    await createUser({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      displayName,
      role: ROLES.ULTIMATE,
      allowedSystems: ALL_SYSTEMS
    });
    return;
  }

  await updateUser(existing.id, {
    username,
    role: ROLES.ULTIMATE,
    allowedSystems: ALL_SYSTEMS,
    isActive: true,
    email,
    displayName
  });
}
