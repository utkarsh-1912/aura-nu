import { auth, isFirebaseConfigured } from "../firebase";

/**
 * fetch wrapper for the Aura API. Attaches the Firebase ID token when a signed-in
 * Firebase user exists. In simulated/guest mode no token is sent; the server only
 * accepts that in local development.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // Guest/demo sessions have no Firebase identity; when Firebase is configured the server would
  // reject them with 401 anyway, so answer locally instead of generating failing requests.
  if (isFirebaseConfigured && !auth?.currentUser) {
    return new Response(JSON.stringify({ error: "Sign in to use cloud features" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const headers = new Headers(init.headers);
  try {
    const user = auth?.currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (err) {
    console.warn("Could not obtain ID token; sending request unauthenticated.", err);
  }
  return fetch(input, { ...init, headers });
}
