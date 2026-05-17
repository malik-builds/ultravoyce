import Link from "next/link";
import { signUpUrl } from "../lib/config";
import styles from "../app/marketing.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.footerTagline}>
          Ultravoyce — Voice agents, built for resellers.
        </p>
        <nav className={styles.footerLinks} aria-label="Footer">
          <Link href="#how-it-works" className={styles.footerLink}>
            How it works
          </Link>
          <Link href="#features" className={styles.footerLink}>
            Features
          </Link>
          <Link href="#pricing" className={styles.footerLink}>
            Pricing
          </Link>
          <Link href={signUpUrl} className={styles.footerLink}>
            Start building
          </Link>
        </nav>
      </div>
    </footer>
  );
}
