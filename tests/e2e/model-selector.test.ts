import { expect, test } from "@playwright/test";

test.describe("Model Selector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the model selector and lets you switch free models", async ({
    page,
  }) => {
    const modelButton = page
      .locator("button")
      .filter({ hasText: /Project Default/i })
      .first();

    await expect(modelButton).toBeVisible();
    await expect(page.getByTestId("multimodal-input")).toBeVisible();
    await expect(page.getByTestId("send-button")).toBeVisible();

    await modelButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("OpenRouter Free Auto")).toBeVisible();
    await expect(dialog.getByText("Qwen 3.6 Plus")).toBeVisible();

    await dialog.getByText("Qwen 3.6 Plus").click();
    await expect(
      page
        .locator("button")
        .filter({ hasText: /Qwen 3\.6 Plus/i })
        .first()
    ).toBeVisible();
  });
});
