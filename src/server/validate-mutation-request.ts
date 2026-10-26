import "server-only";

function readAllowedOrigins() {
  const baseURL = process.env.BETTER_AUTH_URL;

  if (!baseURL) {
    throw new Error("BETTER_AUTH_URL belum dikonfigurasi.");
  }

  const configuredOrigins = [
    baseURL,
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(
    configuredOrigins.map((value) => {
      const url = new URL(value);

      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new Error(
          "Origin aplikasi harus berupa alamat HTTP/HTTPS tanpa path atau kredensial.",
        );
      }

      return url.origin;
    }),
  );
}

export function validateMutationRequest(
  request: Request,
  allowedMediaTypes: readonly string[] = ["application/json"],
): Response | null {
  const allowedOrigins = readAllowedOrigins();
  const origin = request.headers.get("origin");

  if (!origin || !allowedOrigins.has(origin)) {
    return Response.json(
      {
        error: "FORBIDDEN_ORIGIN",
        message: "Asal permintaan tidak diizinkan.",
      },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (!mediaType || !allowedMediaTypes.includes(mediaType)) {
    return Response.json(
      {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: `Permintaan harus menggunakan ${allowedMediaTypes.join(" atau ")}.`,
      },
      {
        status: 415,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return null;
}
