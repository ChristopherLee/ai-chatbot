import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.CHAT_FLOW_BASE_URL ?? "http://localhost:3000";
const csvPath =
  process.env.CHAT_FLOW_CSV_PATH ??
  path.join(process.cwd(), "data", "transactions.sample.csv");
const prompt =
  process.env.CHAT_FLOW_PROMPT ??
  "We want a more conservative plan and mortgage changes in April to 3200.";
const headless = process.env.HEADLESS !== "false";

const CHAT_URL_REGEX = /\/chat\/[\w-]+/;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
  });

  let projectId = null;

  page.on("response", (response) => {
    const match = response.url().match(/\/api\/finance\/project\/([^/?]+)/);
    if (match && !projectId) {
      projectId = match[1];
    }
  });

  try {
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
        document.body.innerText.includes(
          "Before I generate your first spending control plan"
        ),
      null,
      { timeout: 120_000 }
    );

    const input = page.getByTestId("multimodal-input").first();
    const sendButton = page.getByTestId("send-button").first();

    await input.fill(prompt);
    await sendButton.click();

    await page.waitForFunction(
      () =>
        Array.from(
          document.querySelectorAll(
            '[data-testid="message-assistant"] [data-testid="message-content"]'
          )
        ).length >= 2,
      null,
      { timeout: 180_000 }
    );

    await page.waitForFunction(
      () => document.body.innerText.includes("Plan summary"),
      null,
      { timeout: 120_000 }
    );

    const assistantMessages = await page
      .locator(
        '[data-testid="message-assistant"] [data-testid="message-content"]'
      )
      .allTextContents();
    const lastAssistantMessage = assistantMessages.at(-1) ?? "";

    assert(
      /conservative/i.test(lastAssistantMessage),
      `Expected the last assistant message to mention a conservative plan, but got: ${lastAssistantMessage}`
    );
    assert(
      /3,?200/.test(lastAssistantMessage),
      `Expected the last assistant message to mention 3200, but got: ${lastAssistantMessage}`
    );

    console.log(
      JSON.stringify(
        {
          status: "ok",
          baseUrl,
          chatUrl: page.url(),
          projectId,
          prompt,
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
