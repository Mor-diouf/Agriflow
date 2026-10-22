import type { HarvestRecordIn } from "@agriflow/api-client";
import { Button, SelectField, TextField } from "@agriflow/ui";
import { useState, type FormEvent } from "react";

import { hasErrors, parseNumber, todayIso, type Errors } from "./forms";

type Key = "producer_id" | "harvest_date" | "quantity_kg" | "rejected_kg" | "expected_next_week_kg";

/** Relevé d'une collecte chez un producteur, en kilogrammes. */
export function HarvestForm({
  producers,
  onSave,
}: {
  producers: { id: string; label: string }[];
  onSave: (body: HarvestRecordIn) => void;
}) {
  const today = todayIso();
  const empty = { producer_id: "", quantity_kg: "", rejected_kg: "0", expected_next_week_kg: "", notes: "" };
  const [values, setValues] = useState({ ...empty, harvest_date: today });
  const [errors, setErrors] = useState<Errors<Key>>({});
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const quantity = parseNumber(values.quantity_kg);
    const rejected = parseNumber(values.rejected_kg) ?? 0;
    const expected = parseNumber(values.expected_next_week_kg);
    const next: Errors<Key> = {
      producer_id: values.producer_id ? undefined : "Choisissez le producteur.",
      harvest_date: !values.harvest_date || values.harvest_date > today ? "Date du jour ou passée." : undefined,
      quantity_kg: quantity !== undefined && quantity > 0 && quantity <= 50_000 ? undefined : "Quantité collectée en kg, plus de 0.",
      rejected_kg:
        !(rejected >= 0) ? "Quantité rejetée en kg." : quantity !== undefined && rejected > quantity ? "Le rejet dépasse la quantité collectée." : undefined,
      expected_next_week_kg: expected !== undefined && !(expected >= 0 && expected <= 50_000) ? "Quantité attendue en kg." : undefined,
    };
    setErrors(next);
    if (hasErrors(next) || quantity === undefined) return;
    onSave({
      producer_id: values.producer_id,
      harvest_date: values.harvest_date,
      quantity_kg: quantity,
      rejected_kg: rejected,
      expected_next_week_kg: expected ?? null,
      notes: values.notes.trim() || null,
    });
    // On garde la date, on vide le reste pour le producteur suivant
    setValues({ ...empty, harvest_date: values.harvest_date });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Nouvelle collecte" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="af-form-grid">
        <SelectField
          label="Producteur"
          value={values.producer_id}
          onChange={set("producer_id")}
          error={errors.producer_id}
          placeholder={producers.length > 0 ? "Choisir…" : "Aucun producteur : recensez-en un d'abord"}
          options={producers.map((p) => ({ value: p.id, label: p.label }))}
        />
        <TextField label="Date de collecte" type="date" max={today} value={values.harvest_date} onChange={set("harvest_date")} error={errors.harvest_date} />
        <TextField label="Quantité collectée (kg)" inputMode="decimal" value={values.quantity_kg} onChange={set("quantity_kg")} error={errors.quantity_kg} />
        <TextField
          label="Dont rejetée (kg)"
          inputMode="decimal"
          value={values.rejected_kg}
          onChange={set("rejected_kg")}
          error={errors.rejected_kg}
          hint="Fruits abîmés, trop mûrs ou piqués."
        />
        <TextField
          label="Récolte attendue la semaine prochaine (kg)"
          optional
          inputMode="decimal"
          value={values.expected_next_week_kg}
          onChange={set("expected_next_week_kg")}
          error={errors.expected_next_week_kg}
          hint="Ce que le producteur pense récolter : aide à prévoir les collectes."
        />
        <TextField label="Remarque" optional value={values.notes} onChange={set("notes")} maxLength={500} />
      </div>
      <div className="af-form-actions">
        <Button type="submit">Enregistrer la collecte</Button>
      </div>
    </form>
  );
}
