"use client";

import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NLInput } from "./nl-input";

interface Props {
  personId: string;
  personName: string;
}

export function NLInputPersonCard({ personId, personName }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Añadir información por texto libre
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NLInput
          compact
          subjectPersonId={personId}
          placeholder={`Lo que sabes de ${personName.split(" ")[0]}: rol, intereses, contexto, lo último que ha pasado…`}
        />
      </CardContent>
    </Card>
  );
}
