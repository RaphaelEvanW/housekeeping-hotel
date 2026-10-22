import type { Metadata } from "next";
import Image, { getImageProps } from "next/image";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk | Housekeeping",
  description:
    "Portal internal Housekeeping untuk peminjaman dan pengembalian barang hotel.",
};

export default function LoginPage() {
  const common = {
    alt: "",
    fill: true,
    sizes: "100vw",
  };

  const { props: desktopBackground } = getImageProps({
    ...common,
    src: "/images/login/hotel-background.png",
  });

  const { props: portraitBackground } = getImageProps({
    ...common,
    src: "/images/login/hotel-background-portrait.png",
  });

  return (
    <main className="relative isolate grid min-h-svh flex-1 bg-ws-sidebar font-sans text-ws-muted [color-scheme:dark] selection:bg-ws-accent/25 selection:text-white">
      <picture className="pointer-events-none absolute inset-0 -z-20">
        <source
          media="(max-width: 767px)"
          srcSet={portraitBackground.srcSet}
          sizes="100vw"
        />
        <img
          {...desktopBackground}
          alt=""
          className="object-cover object-center"
          loading="eager"
          fetchPriority="high"
        />
      </picture>

      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-ws-sidebar/80"
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-8 md:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] md:px-8 md:py-12 lg:gap-24">
        <section
          aria-labelledby="login-introduction"
          className="hidden md:block"
        >
          <h1
            id="login-introduction"
            className="max-w-lg text-4xl leading-tight font-semibold tracking-tight text-white lg:text-5xl"
          >
            Peminjaman barang lebih tertata.
          </h1>

          <p className="mt-6 max-w-md text-base leading-7 text-ws-muted">
            Catat peminjaman, pengembalian, dan ketersediaan barang operasional
            hotel.
          </p>
        </section>

        <section
          aria-labelledby="login-heading"
          className="w-full max-w-[400px] justify-self-center rounded-lg border border-white/20 bg-ws-sidebar/95 p-6 shadow-[0_12px_32px_#00000040] backdrop-blur-md supports-[backdrop-filter:blur(1px)]:bg-ws-sidebar/40 md:justify-self-end md:p-8"
        >
          <header className="mb-8 text-center">
            <Image
              src="/images/login/housekeeping-emblem.png"
              alt=""
              width={56}
              height={56}
              className="mx-auto mb-4 h-14 w-14 object-contain brightness-0 invert"
            />

            <h2
              id="login-heading"
              className="text-2xl font-semibold tracking-tight text-white"
            >
              Housekeeping
            </h2>

            <p className="mt-2 text-sm leading-6">
              Masuk dengan akun staf Anda.
            </p>
          </header>

          <LoginForm />
        </section>
      </div>
    </main>
  );
}
