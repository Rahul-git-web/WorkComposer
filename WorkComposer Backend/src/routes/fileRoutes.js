import express from "express";
import {
  serveReportFile,
  serveAvatarFile,
  servePublicFile,
  serveRootUploadFile,
  pathTraversalGuard,
} from "../controllers/file.controller.js";

const router = express.Router();

// Guard against path traversal vectors on the /uploads tree
router.use(pathTraversalGuard);

router.get("/reports/{*filename}", serveReportFile);
router.get("/avatars/{*filename}", serveAvatarFile);
router.get("/public/{*filename}", servePublicFile);
router.get("/reports/:filename", serveReportFile);
router.get("/avatars/:filename", serveAvatarFile);
router.get("/public/:filename", servePublicFile);
router.get("/:filename", serveRootUploadFile);
router.get("/{*filename}", serveRootUploadFile);
router.get("/", (req, res) => res.status(404).json({ message: "Not found" }));

export default router;
