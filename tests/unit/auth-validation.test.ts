import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_MIN_LENGTH,
  validateAuthFormData,
} from "@/lib/auth/validation";

test("auth validation returns a specific error for short passwords", () => {
  const formData = new FormData();
  formData.set("email", "user@example.com");
  formData.set("password", "12345");

  const result = validateAuthFormData(formData);

  assert.equal(result.success, false);

  if (result.success) {
    assert.fail("Expected short password validation to fail");
  }

  assert.equal(
    result.message,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  );
});

test("auth validation trims email whitespace for valid credentials", () => {
  const formData = new FormData();
  formData.set("email", "  user@example.com  ");
  formData.set("password", "secret123");

  const result = validateAuthFormData(formData);

  assert.equal(result.success, true);

  if (!result.success) {
    assert.fail("Expected valid credentials to pass validation");
  }

  assert.equal(result.data.email, "user@example.com");
  assert.equal(result.data.password, "secret123");
});
