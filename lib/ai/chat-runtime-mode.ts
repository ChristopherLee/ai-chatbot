export function getChatRuntimeMode({
  isFinanceChat,
}: {
  isFinanceChat: boolean;
}) {
  return isFinanceChat ? "finance" : "general";
}
