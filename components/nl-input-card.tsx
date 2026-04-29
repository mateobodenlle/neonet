"use client";

import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NLInput } from "./nl-input";

export function NLInputCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          ¿Qué pasó hoy?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NLInput compact />
      </CardContent>
    </Card>
  );
}
