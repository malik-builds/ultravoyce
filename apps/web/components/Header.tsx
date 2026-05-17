import Link from "next/link";
import { signInUrl, signUpUrl } from "../lib/config";
import styles from "../app/marketing.module.css";

const navItems = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#pricing", label: "Pricing" },
];

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.logo}>
          Ultravoyce
        </Link>
        <nav className={styles.nav} aria-label="Main">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <Link href={signInUrl} className={styles.textBtn}>
            Sign in
          </Link>
          <Link href={signUpUrl} className={styles.primaryBtn}>
            Start building
          </Link>
        </div>
      </div>
    </header>
  );
}
