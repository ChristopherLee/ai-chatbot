import Form from "next/form";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";

import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AuthForm({
  action,
  children,
  defaultEmail = "",
  passwordAutoComplete = "current-password",
  passwordHint,
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
  passwordAutoComplete?: React.ComponentProps<"input">["autoComplete"];
  passwordHint?: string;
}) {
  const passwordHintId = passwordHint ? "auth-password-hint" : undefined;

  return (
    <Form action={action} className="flex flex-col gap-4 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label
          className="font-normal text-zinc-600 dark:text-zinc-400"
          htmlFor="email"
        >
          Email Address
        </Label>

        <Input
          autoComplete="email"
          autoFocus
          className="bg-muted text-md md:text-sm"
          defaultValue={defaultEmail}
          id="email"
          name="email"
          placeholder="user@acme.com"
          required
          type="email"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label
          className="font-normal text-zinc-600 dark:text-zinc-400"
          htmlFor="password"
        >
          Password
        </Label>

        <Input
          aria-describedby={passwordHintId}
          autoComplete={passwordAutoComplete}
          className="bg-muted text-md md:text-sm"
          id="password"
          minLength={PASSWORD_MIN_LENGTH}
          name="password"
          required
          title={`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`}
          type="password"
        />
        {passwordHint ? (
          <p className="text-muted-foreground text-xs" id={passwordHintId}>
            {passwordHint}
          </p>
        ) : null}
      </div>

      {children}
    </Form>
  );
}
