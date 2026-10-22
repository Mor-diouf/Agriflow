import { api, setAuthTokenSource, setUnauthorizedHandler, type LoginResponse } from "@agriflow/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { forgetFieldData } from "./queries";
import { readJson, removeKey, writeJson } from "./storage";

/** Session de l'agent sur ce téléphone : jeton, date d'expiration (30 jours) et identité. */
export type FieldSession = LoginResponse;

const SESSION_KEY = "agriflow.collecte.session.v1";

export const loadSession = () => readJson<FieldSession | null>(SESSION_KEY, null);

// Relu à chaque appel : une connexion ou une déconnexion s'applique aussitôt à toutes les requêtes
setAuthTokenSource(() => loadSession()?.token ?? null);

/**
 * Connexion de l'agent. Une session expirée n'empêche pas de saisir (le téléphone est souvent
 * hors réseau) : les saisies restent sur le téléphone jusqu'à ce que l'agent se reconnecte.
 */
export function useFieldSession() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(loadSession);
  // Le serveur a refusé le jeton : session expirée, fermée ou compte désactivé
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setRefused(true));
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback((next: FieldSession) => {
    writeJson(SESSION_KEY, next);
    setSession(next);
    setRefused(false);
  }, []);

  const signOut = useCallback(() => {
    const token = loadSession()?.token;
    // Sans réseau, la session se fermera seule à son expiration : on n'attend pas la réponse
    if (token) void api.POST("/v1/auth/logout", { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    removeKey(SESSION_KEY);
    // Les données personnelles des producteurs ne restent pas sur un téléphone déconnecté
    forgetFieldData();
    queryClient.removeQueries({ queryKey: ["field"] });
    setSession(null);
    setRefused(false);
  }, [queryClient]);

  const expired = session !== null && (refused || Date.parse(session.expires_at) <= Date.now());
  return { session, expired, signIn, signOut };
}
