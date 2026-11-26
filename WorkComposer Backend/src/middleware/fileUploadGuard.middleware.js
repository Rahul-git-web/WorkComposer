import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

/**
 * Validates the actual binary signature (magic bytes) of an image file on disk.
 *
 * Supported formats:
 * - JPEG / JPG: 0xFF, 0xD8, 0xFF
 * - PNG: 0x89, 0x50, 0x4E, 0x47 (\x89PNG)
 * - WebP: 0x52, 0x49, 0x46, 0x46 ('RIFF') ... 0x57, 0x45, 0x42, 0x50 ('WEBP')
 * - SVG: XML text containing <svg
 */
export function validateImageMagicBytes(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (stat.size < 4) return null;

    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(Math.min(stat.size, 512));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "image/png";
    }

    // WebP: 'RIFF' .... 'WEBP'
    if (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      return "image/webp";
    }

    // SVG: Text containing <svg
    const textSample = buffer.toString("utf8").trim().toLowerCase();
    if (
      textSample.includes("<svg") &&
      (textSample.startsWith("<?xml") || textSample.startsWith("<svg") || textSample.startsWith("<!doctype"))
    ) {
      return "image/svg+xml";
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Factory for creating secure, bounded Multer upload middleware with magic-byte validation.
 */
export function createUploadGuard({
  fieldName,
  maxSizeBytes,
  allowedExtensions,
  allowedMimeTypes,
  destination = "uploads/",
  validateSignatures = true,
}) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
      cb(null, `upload-${uniqueSuffix}${ext}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error(`Invalid file extension. Allowed: ${allowedExtensions.join(", ")}`));
    }
    if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      return cb(new Error(`Invalid MIME type. Allowed: ${allowedMimeTypes.join(", ")}`));
    }
    cb(null, true);
  };

  const upload = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxSizeBytes,
    },
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          const maxMB = Math.round(maxSizeBytes / (1024 * 1024));
          return res.status(400).json({
            message: `File exceeds maximum allowed size of ${maxMB} MB`,
            error: "File too large",
          });
        }
        return res.status(400).json({
          message: err.message,
          error: "Upload error",
        });
      }

      if (err) {
        return res.status(400).json({
          message: err.message,
          error: "Invalid file",
        });
      }

      // If no file was sent, let downstream handler handle missing file
      if (!req.file) {
        return next();
      }

      // Deep binary signature verification
      if (validateSignatures) {
        const detectedType = validateImageMagicBytes(req.file.path);
        if (!detectedType || !allowedMimeTypes.includes(detectedType)) {
          // Immediately delete spoofed or corrupted temporary file
          try {
            if (fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }
          } catch {}

          return res.status(400).json({
            message: "Invalid file content. File signature does not match allowed image formats.",
            error: "Spoofed or corrupt file signature",
          });
        }
      }

      next();
    });
  };
}

// Preset Guards
export const screenshotUploadGuard = createUploadGuard({
  fieldName: "screenshot",
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  destination: "uploads/screenshots",
  validateSignatures: true,
});

export const logoUploadGuard = createUploadGuard({
  fieldName: "logo",
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".svg"],
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  destination: "uploads/logos",
  validateSignatures: true,
});

export const userImportUploadGuard = createUploadGuard({
  fieldName: "file",
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  allowedExtensions: [".csv", ".json"],
  allowedMimeTypes: [
    "text/csv",
    "application/json",
    "text/plain",
    "application/vnd.ms-excel",
  ],
  destination: "uploads/imports",
  validateSignatures: false, // Text documents, not binary images
});
