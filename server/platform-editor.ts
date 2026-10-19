import type { Express } from "express";
import { storage } from "./storage";
import { createEditorSource } from "./platform-editor-source";
export function tubeEditor(app: Express) {
  return createEditorSource(app, {
    provider: "tube",
    editorPath: "/admin",
    resolve: async (actor) => {
      const u = await storage.getUser(actor.id);
      if (!u?.isActive || u.role !== "admin")
        throw Object.assign(Error("Admin ruxsati yo‘q"), { status: 403 });
      return u.id;
    },
    attach: (req, ctx) => {
      req.session.userId = ctx.nativeId;
      req.session.userRole = "admin";
      (req.session as any).platformEditorHandle = ctx.handle;
    },
  });
}
