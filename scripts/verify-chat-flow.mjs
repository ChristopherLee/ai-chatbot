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

async function waitForCompletedAssistantReply(page, expectedCount) {
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
        document.body.innerText.includes(
          "Your starting spending control plan is ready now."
        ),
      null,
      { timeout: 120_000 }
    );

    const input = page.getByTestId("multimodal-input").first();
    const sendButton = page.getByTestId("send-button").first();
    const initialAssistantMessageCount = await page
      .locator(
        '[data-testid="message-assistant"] [data-testid="message-content"]'
      )
      .count();

    await input.fill(prompt);
    await sendButton.click();

    const lastAssistantMessage = await waitForCompletedAssistantReply(
      page,
      initialAssistantMessageCount + 1
    );

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
