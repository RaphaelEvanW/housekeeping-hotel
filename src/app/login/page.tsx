import type { Metadata } from "next";
import Image, { getImageProps } from "next/image";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Masuk | Housekeeping",
    description: "Portal internal Housekeeping untuk peminjaman dan pengembalian barang hotel.",
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
    <main className={styles.page}>
      <picture className={styles.backgroundLayer}>
        <source
          media="(max-width: 760px)"
          srcSet={portraitBackground.srcSet}
          sizes="100vw"
        />
        <img
          {...desktopBackground}
          alt=""
          className={styles.background}
          loading="eager"
          fetchPriority="high"
        />
      </picture>
      <div className={styles.scrim} aria-hidden="true" />
      <div className={styles.content}>
        <section className={styles.introduction} aria-labelledby="login-introduction">
          <p className={styles.eyebrow}>Portal internal Housekeeping</p>
          <span className={styles.goldRule} aria-hidden="true" />
          <h1 id="login-introduction" className={styles.headline}>Peminjaman Barang<br />Lebih Tertata</h1>
          <p className={styles.description}>Catat peminjaman, pengembalian, dan ketersediaan barang operasional hotel.</p>
        </section>
        <section className={styles.panel} aria-labelledby="login-heading">
          <header className={styles.panelHeader}>
            <Image src="/images/login/housekeeping-emblem.png" alt="" width={112} height={112} className={styles.emblem} />
            <h2 id="login-heading" className={styles.title}>Housekeeping</h2>
            <p className={styles.subtitle}>Masuk dengan akun staf Anda.</p>
          </header>
          <LoginForm />
          <p className={styles.footer}>Akses hanya untuk staf terdaftar</p>
        </section>
      </div>
    </main>
  );
}
