import { Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { sendSuccess } from "../common/ApiResponse";
import { cloudinary } from "../config/cloudinary";

export class UploadController {
  attachment = async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw ApiError.badRequest("No file provided.");
    }

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "trojan-leave-tracker/attachments", resource_type: "auto" },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary upload failed."));
            return;
          }
          resolve(result);
        },
      );
      stream.end(req.file!.buffer);
    });

    sendSuccess(res, { url: uploadResult.secure_url, name: req.file.originalname }, 201);
  };
}
