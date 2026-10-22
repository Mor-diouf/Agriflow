import { api } from "@agriflow/api-client";
import { Button, Notice, TextField } from "@agriflow/ui";
import { useState, type FormEvent } from "react";

import { hasErrors, type Errors } from "./forms";
import type { FieldSession } from "./session";

/**
 * Connexion avec l'identifiant et le code à 6 chiffres donnés par le superviseur.
 * Pour une reconnexion, l'identifiant est fixé : les saisies en attente restent à l'agent qui les a faites.
 */
export function LoginForm({
  fixedLogin,
  onSignedIn,
  onCancel,
}: {
  fixedLogin?: string;
  onSignedIn: (session: FieldSession) => void;
  onCancel?: () => void;
}) {
  const [login, setLogin] = useState(fixedLogin ?? "");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<Errors<"login" | "pin">>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors<"login" | "pin"> = {
      login: login.trim() ? undefined : "Saisissez votre identifiant.",
      pin: /^[0-9]{6}$/.test(pin) ? undefined : "Le code compte 6 chiffres.",
    };
    setErrors(next);
    setFailure("");
    if (hasErrors(next)) return;
    setBusy(true);
    try {
      const { data, error, response } = await api.POST("/v1/auth/login", { body: { login: login.trim(), pin } });
      if (data) {
        onSignedIn(data);
        return;
      }
      const detail = (error as { detail?: unknown } | undefined)?.detail;
      setFailure(typeof detail === "string" ? detail : `Connexion refusée (erreur ${response.status}).`);
      setPin("");
    } catch {
      setFailure("Pas de réseau. La connexion en demande une fois ; ensuite, la saisie fonctionne hors réseau.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Connexion de l'agent" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="af-form-grid">
        <TextField
          label="Identifiant"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          readOnly={fixedLogin !== undefined}
          autoComplete="username"
          autoCapitalize="none"
          error={errors.login}
        />
        <TextField
          label="Code personnel"
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          error={errors.pin}
          hint="6 chiffres, donnés par votre superviseur."
        />
      </div>
      {failure && <Notice tone="danger">{failure}</Notice>}
      <div className="af-form-actions">
        <Button type="submit" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}
