import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 6;

export const authFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    ),
});

export function validateAuthFormData(formData: FormData) {
  const result = authFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.success) {
    return {
      success: false as const,
      message:
        result.error.issues[0]?.message ??
        "Please check your email and password and try again.",
    };
  }

  return {
    success: true as const,
    data: result.data,
  };
}
