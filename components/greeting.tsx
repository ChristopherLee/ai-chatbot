import { motion } from "framer-motion";

export const Greeting = ({
  hasFinanceDataset,
}: {
  hasFinanceDataset: boolean;
}) => {
  return (
    <div
      className="mx-auto mt-4 flex size-full max-w-3xl flex-col justify-center px-4 md:mt-16 md:px-8"
      key="overview"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="font-semibold text-xl md:text-2xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
      >
        {hasFinanceDataset
          ? "Let's build your first plan."
          : "Ask anything, or add a transaction CSV."}
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="text-xl text-zinc-500 md:text-2xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
      >
        {hasFinanceDataset
          ? "Tell me your goals, any life changes, and anything to exclude or treat specially."
          : "You can upload a sample-compatible CSV at any time with: Date, Account, Description, Category, Tags, Amount."}
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 flex flex-wrap gap-2 text-sm text-zinc-500"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.7 }}
      >
        <span className="rounded-full bg-muted px-3 py-1">
          Try: "exclude refinance fee"
        </span>
        <span className="rounded-full bg-muted px-3 py-1">
          Try: "combine travel and transport"
        </span>
        <span className="rounded-full bg-muted px-3 py-1">
          Try: "mortgage changes in April to 3200"
        </span>
      </motion.div>
    </div>
  );
};
