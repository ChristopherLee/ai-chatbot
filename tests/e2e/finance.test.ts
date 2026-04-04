import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const CHAT_URL_REGEX = /\/chat\/[\w-]+/;

async function ensureGuestSession(page: Page) {
  await page.goto("/api/auth/guest?redirectUrl=/");
}

async function uploadFinanceCsv(page: Page) {
  await ensureGuestSession(page);
  await page.goto("/");

  await expect(page.getByTestId("finance-upload-button")).toBeVisible();

  const csvPath = path.join(process.cwd(), "data", "transactions.sample.csv");

  await page
    .locator('input[type="file"][accept*=".csv"]')
    .setInputFiles(csvPath);

  await expect(page).toHaveURL(CHAT_URL_REGEX, { timeout: 30_000 });
  await expect(
    page.getByText("Your starting spending control plan is ready now.")
  ).toBeVisible({ timeout: 30_000 });
}

function getChatInput(page: Page) {
  return page.getByTestId("multimodal-input").first();
}

function getSendButton(page: Page) {
  return page.getByTestId("send-button").first();
}

async function getLastAssistantMessage(page: Page) {
  const messages = await page
    .locator('[data-testid="message-assistant"] [data-testid="message-content"]')
    .allTextContents();

  return (messages.at(-1) ?? "").trim();
}

async function waitForCompletedAssistantReply(page: Page, expectedCount: number) {
  const retryButton = page.getByRole("button", { name: "Retry response" });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForFunction(
      (count) => {
        const assistantMessages = Array.from(
          document.querySelectorAll(
            '[data-testid="message-assistant"] [data-testid="message-content"]'
          )
        ).map((node) => (node.textContent ?? "").trim());

        const lastAssistantMessage =
          assistantMessages.at(assistantMessages.length - 1) ?? "";
        const hasRetryBanner = document.body.innerText.includes(
          "Retry response"
        );
        const isStreaming =
          document.querySelector('[data-testid="stop-button"]') !== null;

        return (
          hasRetryBanner ||
          (!isStreaming &&
            assistantMessages.length >= count &&
            lastAssistantMessage.length > 0)
        );
      },
      expectedCount,
      { timeout: 180_000 }
    );

    const lastAssistantMessage = await getLastAssistantMessage(page);

    if (lastAssistantMessage.length > 0) {
      return lastAssistantMessage;
    }

    if (
      attempt < 2 &&
      (await retryButton.isVisible().catch(() => false))
    ) {
      await retryButton.click();
      continue;
    }

    break;
  }

  return getLastAssistantMessage(page);
}

// TODO: Re-enable once the finance Playwright flow is stable again.
test.describe
  .skip("Finance Prototype", () => {
    test.describe.configure({ mode: "serial" });

    test("uploads a CSV and creates the first finance plan", async ({
      page,
    }) => {
      await uploadFinanceCsv(page);

      await getChatInput(page).fill(
        "We want a more conservative plan and mortgage changes in April to 3200."
      );
      const initialAssistantMessageCount = await page
        .locator(
          '[data-testid="message-assistant"] [data-testid="message-content"]'
        )
        .count();
      await getSendButton(page).click();

      const lastAssistantMessage = await waitForCompletedAssistantReply(
        page,
        initialAssistantMessageCount + 1
      );

      expect(lastAssistantMessage).toMatch(/conservative/i);
      expect(lastAssistantMessage).toMatch(/3,?200/);
    });

    test("can start a second chat in the same project and still see the upload CTA", async ({
      page,
    }) => {
      await uploadFinanceCsv(page);

      await getChatInput(page).fill(
        "We want a more conservative plan and mortgage changes in April to 3200."
      );
      const initialAssistantMessageCount = await page
        .locator(
          '[data-testid="message-assistant"] [data-testid="message-content"]'
        )
        .count();
      await getSendButton(page).click();

      const lastAssistantMessage = await waitForCompletedAssistantReply(
        page,
        initialAssistantMessageCount + 1
      );

      expect(lastAssistantMessage).toMatch(/conservative/i);

      await page
        .getByRole("button", { name: "New chat in project" })
        .first()
        .click();

      await expect(page).toHaveURL(/\/\?projectId=/, { timeout: 30_000 });
      await expect(page.getByText("Plan summary")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Add a transaction CSV")).toBeVisible();
    });
  });
