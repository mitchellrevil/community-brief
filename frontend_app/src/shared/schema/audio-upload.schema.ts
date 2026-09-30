import { z } from "zod";

export const mediaUploadSchema = z.object({
  mediaFile: z.any().refine(
    (file) => {
      // Check if it's a File instance or a File-like object with required properties
      return (
        file instanceof File ||
        (file &&
          typeof file.name === "string" &&
          typeof file.size === "number" &&
          typeof file.type === "string" &&
          typeof file.lastModified === "number" &&
          file.constructor === Blob)
      );
    },
    {
      message: "Please select a file to upload.",
    },
  ),
  promptCategory: z
    .string({
      error: "Please select a service area.",
    })
    .min(1, { message: "Please select a service area." }),
  promptSubcategory: z
    .string({
      error: "Please select a meeting type.",
    })
    .min(1, { message: "Please select a meeting type." }),
});

export type MediaUploadValues = z.infer<typeof mediaUploadSchema>;
