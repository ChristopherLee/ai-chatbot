type FinanceUploadErrorResponse = {
  cause?: unknown;
  error?: unknown;
  message?: unknown;
};

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getFinanceUploadErrorMessage(
  body: FinanceUploadErrorResponse | null | undefined,
  fallback = "Failed to upload transactions"
) {
  return (
    asNonEmptyString(body?.error) ??
    asNonEmptyString(body?.cause) ??
    asNonEmptyString(body?.message) ??
    fallback
  );
}
