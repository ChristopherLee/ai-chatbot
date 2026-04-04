import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.CHAT_FLOW_BASE_URL ?? "http://localhost:3000";
const csvPath =
  process.env.CHAT_FLOW_CSV_PATH ??
  path.join(process.cwd(), "data", "transactions.sample.csv");
const headless = process.env.HEADLESS !== "false";
const viewportWidth = Number(process.env.CHAT_FLOW_VIEWPORT_WIDTH ?? 393);
const viewportHeight = Number(process.env.CHAT_FLOW_VIEWPORT_HEIGHT ?? 852);

const CHAT_URL_REGEX = /\/chat\/[\w-]+/;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureGuestSession(page) {
  const guestUrl = new URL("/api/auth/guest", baseUrl);
  guestUrl.searchParams.set("redirectUrl", "/");

  await page.goto(guestUrl.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
}

async function getLastAssistantMessage(page) {
  const assistantMessages = await page
    .locator(
      '[data-testid="message-assistant"] [data-testid="message-content"]'
    )
    .allTextContents();

  return (assistantMessages.at(-1) ?? "").trim();
}

async function main() {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({
    viewport: { width: viewportWidth, height: viewportHeight },
  });

  let projectId = null;

  page.on("response", (response) => {
    const match = response.url().match(/\/api\/finance\/project\/([^/?]+)/);
    if (match && !projectId) {
      projectId = match[1];
    }
  });

  try {
    await ensureGuestSession(page);

    await page.goto(baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await page.waitForSelector('[data-testid="finance-upload-button"]', {
      timeout: 30_000,
    });

    await page
      .locator('input[type="file"][accept*=".csv"]')
      .setInputFiles(csvPath);

    await page.waitForURL(CHAT_URL_REGEX, { timeout: 120_000 });

    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Welcome to the app.") &&
        document.body.innerText.includes(
          "Step 1 is making sure the dataset is clean and categorized correctly."
        ),
      null,
      { timeout: 120_000 }
    );

    const lastAssistantMessage = await getLastAssistantMessage(page);

    assert(
      /Welcome to the app\./i.test(lastAssistantMessage),
      `Expected the onboarding welcome message after upload, but got: ${lastAssistantMessage}`
    );

    const hasCleanupStep =
      (await page
        .getByText("Suggested Rules")
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText("No strong categorization issues found.")
        .isVisible()
        .catch(() => false));

    assert(
      hasCleanupStep,
      "Expected the onboarding flow to surface categorization review feedback."
    );

    console.log(
      JSON.stringify(
        {
          status: "ok",
          baseUrl,
          chatUrl: page.url(),
          projectId,
          viewport: {
            width: viewportWidth,
            height: viewportHeight,
          },
          lastAssistantMessage,
        },
        null,
        2
      )
    );
  } catch (error) {
    const failureScreenshot = path.join(
      process.cwd(),
      "artifacts",
      "verify-chat-flow-failure.png"
    );

    await page.screenshot({ path: failureScreenshot, fullPage: true });

    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nFailure screenshot: ${failureScreenshot}`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
