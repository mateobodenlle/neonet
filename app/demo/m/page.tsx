import { MobileCapture } from "@/components/mobile/mobile-capture";
import { processNoteDemo } from "@/lib/demo/actions";

export default function DemoHomePage() {
  return (
    <MobileCapture
      processNote={processNoteDemo}
      pendingHref="/demo/m/pending"
      transcribeUrl="/api/demo/transcribe"
    />
  );
}
