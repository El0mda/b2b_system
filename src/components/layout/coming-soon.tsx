import { Card, CardContent } from "@/components/ui/card";
import { Rocket } from "lucide-react";

export function ComingSoon({
  title = "Coming soon",
  description = "This page will be built out in the next phase.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <h3 className="mb-1 text-lg font-semibold">{title}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
