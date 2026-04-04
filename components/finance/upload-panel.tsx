"use client";

import { Loader2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinanceUploadErrorMessage } from "@/lib/finance/upload-errors";
import { cn } from "@/lib/utils";

type UploadPanelProps = {
  chatId: string;
  projectId: string | null;
  compact?: boolean;
  onUploaded?: (chatId: string) => void;
};

export function UploadPanel({
  chatId,
  projectId,
  compact = false,
  onUploaded,
}: UploadPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("chatId", chatId);
    if (projectId) {
      formData.append("projectId", projectId);
    }

    const response = await fetch("/api/finance/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(getFinanceUploadErrorMessage(body));
    }

    return (await response.json()) as { chatId: string; projectId: string };
  };

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      const result = await uploadFile(file);
      toast.success("Transactions uploaded");
      onUploaded?.(result.chatId);
      router.push(`/chat/${result.chatId}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload transactions"
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <Card
      className={cn(
        "border-dashed border-muted-foreground/40 bg-linear-to-br from-background via-background to-muted/40",
        compact ? "rounded-xl shadow-none" : "rounded-2xl shadow-sm"
      )}
    >
      <CardHeader className={compact ? "p-3 pb-2" : "p-5 pb-3"}>
        <CardTitle className={compact ? "text-sm" : "text-lg"}>
          Add a transaction CSV
        </CardTitle>
      </CardHeader>
      <CardContent
        className={compact ? "space-y-3 p-3 pt-0" : "space-y-4 p-5 pt-0"}
      >
        <p className="text-muted-foreground text-sm">
          Optional. Use the sample-compatible export:
          <span className="ml-1 font-mono text-xs">
            Date, Account, Description, Category, Tags, Amount
          </span>
        </p>

        <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
          <span className="rounded-full bg-muted px-2 py-1">
            Add one any time to switch into planner mode
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            Try: "exclude refinance fee"
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            Try: "mortgage changes in April to 3200"
          </span>
        </div>

        <input
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileSelected}
          ref={fileInputRef}
          type="file"
        />

        <Button
          className={compact ? "w-full" : "w-full sm:w-auto"}
          data-testid="finance-upload-button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          {isUploading ? (
            <Loader2Icon className="mr-2 size-4 animate-spin" />
          ) : (
            <UploadIcon className="mr-2 size-4" />
          )}
          {isUploading ? "Uploading..." : "Choose transaction CSV"}
        </Button>
      </CardContent>
    </Card>
  );
}
