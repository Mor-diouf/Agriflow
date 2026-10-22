import type { FieldProducerIn } from "@agriflow/api-client";
import { Button, CheckboxField, SelectField, TextField } from "@agriflow/ui";
import { useState, type FormEvent } from "react";

import { hasErrors, parseNumber, type Errors } from "./forms";

type Key = "full_name" | "phone" | "village" | "zone" | "area_ha" | "trees" | "position" | "consent";

const EMPTY = { full_name: "", phone: "", village: "", zone: "", area_ha: "", trees: "", main_variety: "", latitude: "", longitude: "" };

// Mêmes bornes que le serveur : la Casamance
const LAT = [12.0, 13.5] as const;
const LON = [-17.0, -13.5] as const;

/** Fiche de recensement d'un producteur, contrôlée comme sur le serveur avant d'être gardée. */
export function ProducerForm({ zones, onSave, onCancel }: { zones: string[]; onSave: (body: FieldProducerIn) => void; onCancel: () => void }) {
  const [values, setValues] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors<Key>>({});
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value });

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("Ce téléphone ne donne pas sa position.");
      return;
    }
    setGpsStatus("Recherche de la position…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValues((v) => ({ ...v, latitude: pos.coords.latitude.toFixed(5), longitude: pos.coords.longitude.toFixed(5) }));
        setGpsStatus(`Position relevée, précision ${Math.round(pos.coords.accuracy)} m.`);
      },
      () => setGpsStatus("Position indisponible : autorisez la localisation ou saisissez-la plus tard."),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const area = parseNumber(values.area_ha);
    const trees = parseNumber(values.trees);
    const lat = parseNumber(values.latitude);
    const lon = parseNumber(values.longitude);
    const next: Errors<Key> = {
      full_name: values.full_name.trim().length < 2 ? "Indiquez le nom du producteur." : undefined,
      village: values.village.trim().length < 2 ? "Indiquez le village." : undefined,
      zone: values.zone ? undefined : "Choisissez la zone.",
      phone: values.phone.trim() && !/^\+?[0-9 ]{7,20}$/.test(values.phone.trim()) ? "Numéro invalide : chiffres seulement." : undefined,
      area_ha: area !== undefined && !(area >= 0 && area <= 1000) ? "Surface en hectares, entre 0 et 1 000." : undefined,
      trees: trees !== undefined && !(Number.isInteger(trees) && trees >= 0) ? "Nombre entier de manguiers." : undefined,
      position:
        (lat === undefined) !== (lon === undefined) ||
        (lat !== undefined && !(lat >= LAT[0] && lat <= LAT[1])) ||
        (lon !== undefined && !(lon >= LON[0] && lon <= LON[1]))
          ? "Position hors de la Casamance : relevez-la à nouveau."
          : undefined,
      consent: consent ? undefined : "Le producteur doit avoir donné son accord.",
    };
    setErrors(next);
    if (hasErrors(next)) return;
    onSave({
      full_name: values.full_name.trim(),
      phone: values.phone.trim() || null,
      village: values.village.trim(),
      zone: values.zone as FieldProducerIn["zone"],
      area_ha: area ?? null,
      trees: trees ?? null,
      main_variety: values.main_variety.trim() || null,
      latitude: lat ?? null,
      longitude: lon ?? null,
      consent_given: true,
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Recenser un producteur" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="af-form-grid">
        <TextField label="Nom du producteur" value={values.full_name} onChange={set("full_name")} error={errors.full_name} autoComplete="off" />
        <TextField label="Téléphone" optional type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} error={errors.phone} />
        <TextField label="Village" value={values.village} onChange={set("village")} error={errors.village} />
        <SelectField
          label="Zone"
          value={values.zone}
          onChange={set("zone")}
          error={errors.zone}
          placeholder="Choisir…"
          options={zones.map((z) => ({ value: z, label: z }))}
        />
        <TextField label="Surface du verger (ha)" optional inputMode="decimal" value={values.area_ha} onChange={set("area_ha")} error={errors.area_ha} />
        <TextField label="Nombre de manguiers" optional inputMode="numeric" value={values.trees} onChange={set("trees")} error={errors.trees} />
        <TextField label="Variété principale" optional placeholder="Kent, Keitt…" value={values.main_variety} onChange={set("main_variety")} />
      </div>

      <div className="af-form-field">
        <span className="af-form-field__label">
          Position du verger <span className="af-form-field__optional">· facultatif</span>
        </span>
        <div className="af-form-actions">
          <Button variant="secondary" onClick={locate}>
            Relever la position GPS
          </Button>
          <span className="af-num" style={{ fontSize: 14 }}>
            {values.latitude && values.longitude ? `${values.latitude}, ${values.longitude}` : "Non relevée"}
          </span>
        </div>
        {gpsStatus && (
          <span className="af-field__hint" role="status">
            {gpsStatus}
          </span>
        )}
        {errors.position && <span className="af-form-field__error">{errors.position}</span>}
      </div>

      <CheckboxField
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
        error={errors.consent}
        label={
          <>
            J'ai expliqué au producteur que ses informations servent uniquement à organiser la collecte de ses
            mangues et qu'il peut demander à les faire supprimer. <strong>Il a donné son accord.</strong>
          </>
        }
      />

      <div className="af-form-actions">
        <Button type="submit">Enregistrer le producteur</Button>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
