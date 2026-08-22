import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { ApiError } from "../common/ApiError";
import { asyncHandler } from "../common/asyncHandler";
import { authenticate } from "../middleware/authenticate";
import { UploadController } from "../controllers/upload.controller";

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Only PDF, JPG, or PNG files are allowed."));
      return;
    }
    cb(null, true);
  },
});

function handleUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(ApiError.badRequest("File is too large — the limit is 5 MB."));
        return;
      }
      next(ApiError.badRequest(err.message));
      return;
    }
    if (err) {
      next(ApiError.badRequest(err instanceof Error ? err.message : "Upload failed."));
      return;
    }
    next();
  });
}

const router = Router();
const controller = new UploadController();

router.use(authenticate);
router.post("/attachment", handleUpload, asyncHandler(controller.attachment));

export default router;
