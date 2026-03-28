import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const CHAT_URL_REGEX = /\/chat\/[\w-]+/;

async function uploadFinanceCsv(page: Page) {
  await page.goto("/");

  await expect(
    page.getByText("Upload a transaction CSV to begin.")
  ).toBeVisible();

  const csvPath = path.join(process.cwd(), "data", "transactions.sample.csv");

  await page
    .locator('input[type="file"][accept*=".csv"]')
    .setInputFiles(csvPath);

  await expect(page).toHaveURL(CHAT_URL_REGEX, { timeout: 30_000 });
  await expect(
    page.getByText("Before I generate your first spending control plan")
  ).toBeVisible({ timeout: 30_000 });
}

function getChatInput(page: Page) {
  return page.getByTestId("multimodal-input").first();
}

function getSendButton(page: Page) {
  return page.getByTestId("send-button").first();
}

// TODO: Re-enable once the finance Playwright flow is stable again.
test.describe.skip("Finance Prototype", () => {
  test.describe.configure({ mode: "serial" });

  test("uploads a CSV and creates the first finance plan", async ({
    page,
  }) => {
    await uploadFinanceCsv(page);

    await getChatInput(page).fill(
      "We want a more conservative plan and mortgage changes in April to 3200."
    );
    await getSendButton(page).click();

    await expect(page.getByText("Plan summary")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Set Mortgage monthly budget to $3200").first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Switched plan mode to conservative").first()
    ).toBeVisible({
      timeout: 30_000,
    });
  });

  test("can start a second chat in the same project without re-uploading the dataset", async ({
    page,
  }) => {
    await uploadFinanceCsv(page);

    await getChatInput(page).fill(
      "We want a more conservative plan and mortgage changes in April to 3200."
    );
    await getSendButton(page).click();

    await expect(page.getByText("Plan summary")).toBeVisible({
      timeout: 60_000,
    });

    await page
      .getByRole("button", { name: "New chat in project" })
      .first()
      .click();

    await expect(page).toHaveURL(/\/\?projectId=/, { timeout: 30_000 });
    await expect(page.getByText("Plan summary")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Upload your transaction CSV")
    ).not.toBeVisible();
  });
});
