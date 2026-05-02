"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Pencil,
  Check,
  X,
  Briefcase,
  GraduationCap,
  Award,
  Languages,
  FolderGit2,
  BookOpen,
  Phone,
  Mail,
  Tag,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  updateMeProfileScalar,
  updateMeProfileSkills,
  updatePositionFinished,
  type MeProfileFull,
  type Editable,
  type Position,
} from "@/lib/me-profile-actions";

export function MeProfileView({ initial }: { initial: MeProfileFull }) {
  const [profile, setProfile] = useState<MeProfileFull>(initial);
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{fullName || "Sobre mí"}</h1>
        <EditableScalar
          label="Headline"
          field="headline"
          value={profile.headline}
          onSave={(v) => setProfile((p) => ({ ...p, headline: v }))}
          long={false}
        />
        <p className="pt-2 text-[12px] text-muted-foreground">
          Estos datos provienen del último{" "}
          <code className="rounded bg-secondary px-1">import:linkedin-self</code>. Re-impórtalos
          para refrescar los campos no editables. La caché del prompt se invalida automáticamente
          al guardar.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-[14px]">Resumen</CardTitle>
        </CardHeader>
        <CardContent>
          <EditableScalar
            field="summary"
            value={profile.summary}
            onSave={(v) => setProfile((p) => ({ ...p, summary: v }))}
            long={true}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[14px]">Datos básicos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ubicación">
            <EditableScalar
              field="location"
              value={profile.location}
              onSave={(v) => setProfile((p) => ({ ...p, location: v }))}
            />
          </Field>
          <Field label="Industria">
            <EditableScalar
              field="industry"
              value={profile.industry}
              onSave={(v) => setProfile((p) => ({ ...p, industry: v }))}
            />
          </Field>
          <Field label="Dirección">
            <EditableScalar
              field="address"
              value={profile.address}
              onSave={(v) => setProfile((p) => ({ ...p, address: v }))}
            />
          </Field>
          <Field label="Código postal">
            <EditableScalar
              field="zip_code"
              value={profile.zip_code}
              onSave={(v) => setProfile((p) => ({ ...p, zip_code: v }))}
            />
          </Field>
          <Field label="Cumpleaños">
            <EditableScalar
              field="birth_date"
              value={profile.birth_date}
              onSave={(v) => setProfile((p) => ({ ...p, birth_date: v }))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Briefcase className="h-3.5 w-3.5" /> Posiciones
          </CardTitle>
          <span className="text-[12px] text-muted-foreground">
            {profile.positions.length} totales · {profile.positions.filter((p) => !p.finished_on).length} actuales
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          {profile.positions.map((pos, i) => (
            <PositionRow
              key={`${pos.company}-${i}`}
              position={pos}
              index={i}
              onChange={(next) =>
                setProfile((p) => ({
                  ...p,
                  positions: p.positions.map((x, j) => (j === i ? next : x)),
                }))
              }
            />
          ))}
          {profile.positions.length === 0 && (
            <div className="text-[12px] text-muted-foreground">No hay posiciones.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <GraduationCap className="h-3.5 w-3.5" /> Educación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {profile.education.map((e, i) => (
            <div key={i} className="rounded border border-border bg-secondary/20 px-3 py-2 text-[13px]">
              <div className="font-medium">{e.school}</div>
              <div className="text-[12px] text-muted-foreground">
                {e.degree}
                {e.started_on || e.finished_on
                  ? ` · ${e.started_on ?? "?"}–${e.finished_on ?? "?"}`
                  : ""}
              </div>
              {e.activities && (
                <div className="mt-1 text-[12px] text-muted-foreground">{e.activities}</div>
              )}
            </div>
          ))}
          {profile.education.length === 0 && (
            <div className="text-[12px] text-muted-foreground">No hay educación.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Tag className="h-3.5 w-3.5" /> Skills
          </CardTitle>
          <span className="text-[12px] text-muted-foreground">{profile.skills.length}</span>
        </CardHeader>
        <CardContent>
          <SkillsEditor
            value={profile.skills}
            onSave={(skills) => setProfile((p) => ({ ...p, skills }))}
          />
        </CardContent>
      </Card>

      <CollapsibleCard
        title="Honores"
        icon={<Award className="h-3.5 w-3.5" />}
        count={profile.honors.length}
      >
        {profile.honors.map((h, i) => (
          <div key={i} className="rounded border border-border bg-secondary/20 px-3 py-2 text-[13px]">
            <div className="font-medium">{h.title}</div>
            {h.issued_on && <div className="text-[12px] text-muted-foreground">{h.issued_on}</div>}
            {h.description && (
              <div className="mt-1 text-[12px] text-muted-foreground">{h.description}</div>
            )}
          </div>
        ))}
      </CollapsibleCard>

      <CollapsibleCard
        title="Idiomas"
        icon={<Languages className="h-3.5 w-3.5" />}
        count={profile.languages.length}
      >
        <ul className="text-[13px]">
          {profile.languages.map((l, i) => (
            <li key={i}>
              <strong>{l.name}</strong>
              {l.proficiency ? ` — ${l.proficiency}` : ""}
            </li>
          ))}
        </ul>
      </CollapsibleCard>

      <CollapsibleCard
        title="Proyectos"
        icon={<FolderGit2 className="h-3.5 w-3.5" />}
        count={profile.projects.length}
      >
        {profile.projects.map((pr, i) => (
          <div key={i} className="rounded border border-border bg-secondary/20 px-3 py-2 text-[13px]">
            <div className="font-medium">{pr.title}</div>
            {(pr.started_on || pr.finished_on) && (
              <div className="text-[12px] text-muted-foreground">
                {pr.started_on ?? "?"}–{pr.finished_on ?? "?"}
              </div>
            )}
            {pr.description && (
              <div className="mt-1 text-[12px] text-muted-foreground line-clamp-3">
                {pr.description}
              </div>
            )}
          </div>
        ))}
      </CollapsibleCard>

      <CollapsibleCard
        title="Cursos"
        icon={<BookOpen className="h-3.5 w-3.5" />}
        count={profile.courses.length}
      >
        <ul className="text-[13px]">
          {profile.courses.map((c, i) => (
            <li key={i}>
              {c.name}
              {c.number ? ` (${c.number})` : ""}
            </li>
          ))}
        </ul>
      </CollapsibleCard>

      <CollapsibleCard
        title="Learning"
        icon={<BookOpen className="h-3.5 w-3.5" />}
        count={profile.learning.length}
      >
        <ul className="space-y-1.5 text-[13px]">
          {profile.learning.map((l, i) => (
            <li key={i}>
              <div className="font-medium">{l.title}</div>
              <div className="text-[11px] text-muted-foreground">
                {l.type}
                {l.last_watched ? ` · visto ${l.last_watched}` : ""}
                {l.saved ? " · guardado" : ""}
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleCard>

      <CollapsibleCard
        title="Teléfonos"
        icon={<Phone className="h-3.5 w-3.5" />}
        count={profile.phone_numbers.length}
      >
        <ul className="text-[13px]">
          {profile.phone_numbers.map((p, i) => (
            <li key={i}>
              {p.number}
              {p.type ? ` · ${p.type}` : ""}
            </li>
          ))}
        </ul>
      </CollapsibleCard>

      <CollapsibleCard
        title="Emails"
        icon={<Mail className="h-3.5 w-3.5" />}
        count={profile.emails.length}
      >
        <ul className="text-[13px]">
          {profile.emails.map((e, i) => (
            <li key={i}>
              {e.address}
              {e.primary ? " · primario" : ""}
              {e.confirmed ? " · confirmado" : ""}
            </li>
          ))}
        </ul>
      </CollapsibleCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function EditableScalar({
  label,
  field,
  value,
  onSave,
  long,
}: {
  label?: string;
  field: Editable;
  value: string | null;
  onSave: (v: string | null) => void;
  long?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    const next = draft.trim() || null;
    startTransition(async () => {
      try {
        await updateMeProfileScalar(field, next);
        onSave(next);
        setEditing(false);
        toast.success("Guardado");
      } catch (e) {
        toast.error("Error guardando", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-start gap-2">
        {long ? (
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="flex-1 text-[13px]"
          />
        ) : (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            placeholder={label}
            className="flex-1 text-[13px]"
          />
        )}
        <Button size="sm" variant="outline" onClick={save} disabled={pending}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel} disabled={pending}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <div className={`flex-1 text-[13px] ${value ? "" : "italic text-muted-foreground"} ${long ? "whitespace-pre-line" : ""}`}>
        {value || "—"}
      </div>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Editar"
      >
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

function PositionRow({
  position,
  index,
  onChange,
}: {
  position: Position;
  index: number;
  onChange: (next: Position) => void;
}) {
  const [pending, startTransition] = useTransition();
  const isCurrent = !position.finished_on;
  function toggle() {
    const next = isCurrent ? new Date().toISOString().slice(0, 7) : null;
    startTransition(async () => {
      try {
        await updatePositionFinished(index, next);
        onChange({ ...position, finished_on: next });
        toast.success(isCurrent ? "Marcado como finalizado" : "Marcado como actual");
      } catch (e) {
        toast.error("Error", { description: e instanceof Error ? e.message : String(e) });
      }
    });
  }
  return (
    <div className="flex items-start gap-3 rounded border border-border bg-secondary/20 px-3 py-2 text-[13px]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{position.title ?? "—"}</span>
          {isCurrent && <Badge variant="accent">actual</Badge>}
        </div>
        <div className="text-[12px] text-muted-foreground">
          {position.company}
          {position.location ? ` · ${position.location}` : ""}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {position.started_on ?? "?"}–{position.finished_on ?? "presente"}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={toggle} disabled={pending}>
        {isCurrent ? "Marcar finalizada" : "Marcar actual"}
      </Button>
    </div>
  );
}

function SkillsEditor({
  value,
  onSave,
}: {
  value: string[];
  onSave: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  function persist(next: string[]) {
    startTransition(async () => {
      try {
        await updateMeProfileSkills(next);
        onSave(next);
      } catch (e) {
        toast.error("Error", { description: e instanceof Error ? e.message : String(e) });
      }
    });
  }
  function add() {
    const t = draft.trim();
    if (!t) return;
    if (value.includes(t)) {
      setDraft("");
      return;
    }
    persist([...value, t]);
    setDraft("");
  }
  function remove(s: string) {
    persist(value.filter((x) => x !== s));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((s) => (
          <button
            key={s}
            onClick={() => remove(s)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[12px] hover:bg-destructive/10 hover:text-destructive"
          >
            {s}
            <X className="h-3 w-3" />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Añadir skill…"
          className="h-8 text-[13px]"
        />
        <Button size="sm" variant="outline" onClick={add} disabled={!draft.trim() || pending}>
          Añadir
        </Button>
      </div>
    </div>
  );
}

function CollapsibleCard({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <Card>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 hover:bg-secondary/30"
      >
        <CardTitle className="flex items-center gap-2 text-[14px]">
          {icon}
          {title}
          <span className="text-[12px] font-normal text-muted-foreground">{count}</span>
        </CardTitle>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <CardContent className="space-y-2 pt-0">{children}</CardContent>}
    </Card>
  );
}
