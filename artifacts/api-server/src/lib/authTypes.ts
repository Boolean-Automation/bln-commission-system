// The api-zod barrel intentionally exports only the generated Zod schemas (not
// the generated TS types, which collide on *Params names). Declare the AuthUser
// shape here as the single source of truth for server code. Keep in sync with
// the `AuthUser` schema in lib/api-spec/openapi.yaml.
export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}
