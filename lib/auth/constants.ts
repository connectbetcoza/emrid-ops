/**
 * Auth cookie names. Kept in a server-only-free module so both the cookie
 * helpers (Node) and the middleware (Edge) can share them without drift.
 *
 * Namespaced `_ops_` to stay distinct from the Patient Platform's cookies even
 * if both ever share an apex domain.
 */
export const ID_TOKEN_COOKIE = "emrid_ops_id_token";
export const REFRESH_TOKEN_COOKIE = "emrid_ops_refresh_token";

/** Where unauthenticated users are sent (the `/login` route — `app/login`). */
export const LOGIN_PATH = "/login";

/** Post-login destination for an authenticated Ops user. */
export const DEFAULT_AUTHENTICATED_PATH = "/mission-control";
