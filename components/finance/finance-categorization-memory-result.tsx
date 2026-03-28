"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinanceCategorizationMemory } from "@/lib/finance/categorization-review-shared";

function MemorySection({
  items,
  title,
}: {
  items: FinanceCategorizationMemory["acceptedRules"];
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-sm">
        {items.length > 0 ? (
          items.map((item) => (
            <Badge key={item.id} variant="outline">
              {item.summary}
            </Badge>
          ))
        ) : (
          <div className="text-muted-foreground">None saved yet.</div>
        )}
      </CardContent>
    </Card>
  );
}

export function FinanceCategorizationMemoryResult({
  result,
}: {
  result: FinanceCategorizationMemory;
}) {
  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {result.acceptedRules.length + result.acceptedTransactions.length}{" "}
          accepted
        </Badge>
        <Badge variant="secondary">
          {result.deniedRules.length + result.deniedTransactions.length} denied
        </Badge>
      </div>
      <MemorySection items={result.acceptedRules} title="Accepted Rules" />
      <MemorySection
        items={result.acceptedTransactions}
        title="Accepted Transaction Examples"
      />
      <MemorySection items={result.deniedRules} title="Denied Rules" />
      <MemorySection
        items={result.deniedTransactions}
        title="Denied Transaction Suggestions"
      />
    </div>
  );
}
