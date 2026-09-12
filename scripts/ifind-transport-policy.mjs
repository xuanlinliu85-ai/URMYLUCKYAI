export function assessIfindTransport(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const secure = url.protocol === "https:";
  const requireSecure = process.env.IFIND_REQUIRE_SECURE_TRANSPORT === "1";
  const legacyAuthorized = process.env.IFIND_ALLOW_INSECURE_HTTP === "1";
  if (!secure && requireSecure) {
    throw new Error("iFinD transport policy requires HTTPS; configure a verified HTTPS, VPN or tunnel endpoint");
  }
  return {
    secure,
    legacyAuthorized,
    warning: secure
      ? null
      : `iFinD is using legacy HTTP transport with an API key in the URL query${legacyAuthorized ? " (explicitly authorized)" : ""}`,
  };
}
