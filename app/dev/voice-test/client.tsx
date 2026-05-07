"use client";

import { useState } from "react";
import { VoiceInput } from "@/components/shared/voice-input";

interface Entry {
  text: string;
  at: string;
}

export function VoiceTestClient() {
  const [entries, setEntries] = useState<Entry[]>([]);

  return (
    <div className="space-y-4">
      <VoiceInput
        onTranscript={(text) =>
          setEntries((prev) => [{ text, at: new Date().toISOString() }, ...prev])
        }
      />
      <div className="text-xs text-muted-foreground">
        Transcripciones: <span className="font-mono">{entries.length}</span>
      </div>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={i} className="rounded-md border border-border bg-background px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {e.at}
            </div>
            <pre className="whitespace-pre-wrap text-[13px]">{e.text}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
