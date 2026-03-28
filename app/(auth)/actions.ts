"use server";

import { createUser, getUser } from "@/lib/db/queries";
import { validateAuthFormData } from "@/lib/auth/validation";

import { signIn } from "./auth";

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
  message?: string;
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = validateAuthFormData(formData);

    if (!validatedData.success) {
      return {
        status: "invalid_data",
        message: validatedData.message,
      };
    }

    await signIn("credentials", {
      email: validatedData.data.email,
      password: validatedData.data.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (_error) {
    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data";
  message?: string;
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = validateAuthFormData(formData);

    if (!validatedData.success) {
      return {
        status: "invalid_data",
        message: validatedData.message,
      };
    }

    const [user] = await getUser(validatedData.data.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }
    await createUser(validatedData.data.email, validatedData.data.password);
    await signIn("credentials", {
      email: validatedData.data.email,
      password: validatedData.data.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (_error) {
    return { status: "failed" };
  }
};
