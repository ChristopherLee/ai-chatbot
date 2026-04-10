import { isStreamTimeoutError } from "@/lib/ai/stream-timeout";

function isGatewayActivationError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes(
      "AI Gateway requires a valid credit card on file to service requests"
    )
  );
}

function isGatewayInsufficientFundsError(error: unknown) {
  return error instanceof Error && error.message.includes("Insufficient funds");
}

function isOpenRouterKeyLimitError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Key limit exceeded (total limit)")
  );
}

export function buildFinanceStreamErrorMessage(error: unknown) {
  if (isGatewayActivationError(error)) {
    return "The finance reply could not finish because AI Gateway is not activated for this project. Activate AI Gateway, then retry this message.";
  }

  if (isGatewayInsufficientFundsError(error)) {
    return "The finance reply could not finish because AI Gateway is out of credits. Add credits in Vercel AI Gateway, then retry this message.";
  }

  if (isOpenRouterKeyLimitError(error)) {
    return "The finance reply could not finish because the configured OpenRouter key is over its limit. Recharge or replace that key, then retry this message.";
  }

  if (isStreamTimeoutError(error)) {
    return "The finance reply timed out before the written explanation finished. Retry this message to generate the explanation again, or keep chatting from the current plan.";
  }

  return "The finance reply could not finish because the model hit an internal error. Retry this message to generate the explanation again, or keep chatting from the current plan.";
}

export function buildStreamErrorMessage(error: unknown) {
  if (isGatewayActivationError(error)) {
    return "The model could not respond because AI Gateway is not activated for this project yet. Once it is activated, you can retry this message.";
  }

  if (isGatewayInsufficientFundsError(error)) {
    return "The model could not respond because AI Gateway is out of credits. Add credits in Vercel AI Gateway, then retry this message.";
  }

  if (isOpenRouterKeyLimitError(error)) {
    return "The model could not respond because the configured OpenRouter key is over its limit. Recharge or replace that key, then retry this message.";
  }

  if (isStreamTimeoutError(error)) {
    return "That reply took too long to finish, so I stopped the request. Please try again.";
  }

  return "I ran into a model error while finishing that response. Please try again.";
}
