import {
  ArrowRight,
  Calendar,
  HelpCircle,
  MessageCircle,
  Palette,
  Phone,
  Variable,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { WorkflowPreview } from "../components/WorkflowPreview";
import { signUpUrl } from "../lib/config";
import styles from "./marketing.module.css";

const features = [
  {
    title: "Visual workflow editor",
    description:
      "Build conversation flows visually. No code, no guesswork. If you can draw a flowchart, you can build a voice agent.",
    icon: Workflow,
    color: "var(--node-tell)",
  },
  {
    title: "Smart conversation nodes",
    description:
      "Greet callers, capture details, answer business questions, book appointments, transfer calls — each behaviour is a node you drag onto the canvas.",
    icon: MessageCircle,
    color: "var(--node-tell)",
  },
  {
    title: "Calendar booking, built in",
    description:
      "Connect to cal.com and let the agent handle scheduling end-to-end. Available slots in natural language. Confirmations sent automatically.",
    icon: Calendar,
    color: "var(--node-sky)",
  },
  {
    title: "White-label ready",
    description:
      "No Ultravoyce branding in your client-facing product. Ever.",
    icon: Palette,
    color: "var(--node-amber)",
  },
  {
    title: "Global variables",
    description:
      "Personalise every call. The agent knows the caller's name, their booking reference, their history — and speaks accordingly.",
    icon: Variable,
    color: "var(--node-violet)",
  },
  {
    title: "Deploy instantly",
    description:
      "Publish a workflow and it's live. No build step, no waiting, no DevOps.",
    icon: Zap,
    color: "var(--node-slate)",
  },
] as const;

const useCases = [
  {
    title: "AI receptionist",
    description:
      "Never miss an inbound call. Answer questions, capture leads, and route callers — around the clock.",
    icon: Phone,
    color: "var(--node-rose)",
  },
  {
    title: "Appointment booking agent",
    description:
      "Let customers schedule in their own time. The agent checks availability, confirms the booking, and sends a follow-up — without anyone lifting a finger.",
    icon: Calendar,
    color: "var(--node-sky)",
  },
  {
    title: "General enquiry agent",
    description:
      "Handle the repetitive questions every SME gets every day. Hours, location, pricing, services — answered instantly, consistently, professionally.",
    icon: HelpCircle,
    color: "var(--node-violet)",
  },
] as const;

export default function Home() {
  return (
    <div className={styles.page}>
      <Header />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              Voice agents your clients can&apos;t build. Delivered under your
              brand.
            </h1>
            <p className={styles.heroSubtitle}>
              Ultravoyce gives you a no-code platform to build, deploy, and
              white-label AI voice agents — so you can sell smarter automation
              to every SME on your books.
            </p>
            <div className={styles.heroCtas}>
              <Link href={signUpUrl} className={`${styles.primaryBtn} ${styles.primaryBtnLg}`}>
                Start building
                <ArrowRight size={16} strokeWidth={1.5} />
              </Link>
              <Link href="#how-it-works" className={styles.secondaryBtn}>
                See how it works
              </Link>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <WorkflowPreview />
          </div>
        </div>
      </section>

      <div className={styles.socialProof}>
        <p className={styles.socialProofInner}>
          Trusted by agencies and resellers across the region
        </p>
      </div>

      <section className={`${styles.section} ${styles.problem}`}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>The opportunity</p>
          <h2 className={styles.sectionTitle}>
            The gap your clients can&apos;t close
          </h2>
          <p className={styles.sectionLead}>
            Small businesses know they need better customer communication. They
            just don&apos;t have the time, budget, or technical resources to build
            it themselves.
          </p>
          <div className={styles.problemGrid}>
            <p className={styles.problemHighlight}>
              That&apos;s your <strong>opportunity</strong>.
            </p>
            <p className={styles.sectionLead}>
              Ultravoyce lets you step in as the expert — offering AI-powered
              voice agents that answer calls, book appointments, and handle
              enquiries 24/7, without a single line of code.
            </p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className={styles.section}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>How it works</p>
          <h2 className={styles.sectionTitle}>Build once. Sell to anyone.</h2>
          <div className={styles.steps}>
            <article className={styles.step}>
              <p className={styles.stepNumber}>1</p>
              <h3 className={styles.stepTitle}>Design the workflow</h3>
              <p className={styles.stepDesc}>
                Use Ultravoyce&apos;s visual editor to map out exactly how a voice
                agent should handle a call — from greeting to booking to
                transfer. Drag, drop, done.
              </p>
            </article>
            <article className={styles.step}>
              <p className={styles.stepNumber}>2</p>
              <h3 className={styles.stepTitle}>Configure for each client</h3>
              <p className={styles.stepDesc}>
                Swap in business details, connect their calendar, define their
                FAQs. Every deployment is tailored, none of it requires a
                developer.
              </p>
            </article>
            <article className={styles.step}>
              <p className={styles.stepNumber}>3</p>
              <h3 className={styles.stepTitle}>Deliver under your brand</h3>
              <p className={styles.stepDesc}>
                Your clients see your product, your name, your pricing.
                Ultravoyce stays invisible.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="features" className={styles.section}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Features</p>
          <h2 className={styles.sectionTitle}>
            Everything you need to run a voice agent business
          </h2>
          <div className={styles.featuresGrid}>
            {features.map((feature) => (
              <article key={feature.title} className={styles.featureCard}>
                <div
                  className={styles.featureIcon}
                  style={{ color: feature.color }}
                >
                  <feature.icon size={18} strokeWidth={1.5} />
                </div>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureDesc}>{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="use-cases" className={`${styles.section} ${styles.useCases}`}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Use cases</p>
          <h2 className={styles.sectionTitle}>
            Built for the agents your clients actually need
          </h2>
          <div className={styles.useCaseGrid}>
            {useCases.map((useCase) => (
              <article key={useCase.title} className={styles.useCaseCard}>
                <useCase.icon
                  size={20}
                  strokeWidth={1.5}
                  style={{ color: useCase.color, marginBottom: 12 }}
                />
                <h3 className={styles.useCaseTitle}>{useCase.title}</h3>
                <p className={styles.useCaseDesc}>{useCase.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.sectionInner} ${styles.whiteLabel}`}>
          <p className={styles.sectionLabel}>White-label</p>
          <h2 className={styles.sectionTitle}>
            Your platform. Your clients. Your revenue.
          </h2>
          <p className={styles.sectionLead}>
            Ultravoyce is built for resellers. You get a fully white-labeled
            product you can package, price, and sell as your own — with the
            margin to match.
          </p>
          <div className={styles.whiteLabelPoints}>
            <span className={styles.whiteLabelPoint}>No revenue sharing</span>
            <span className={styles.whiteLabelPoint}>
              No referral agreements
            </span>
            <span className={styles.whiteLabelPoint}>
              No Ultravoyce in the room
            </span>
          </div>
          <p className={styles.sectionLead} style={{ marginTop: 32 }}>
            Just a powerful product with your name on it.
          </p>
        </div>
      </section>

      <section id="pricing" className={styles.section}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Pricing</p>
          <h2 className={styles.sectionTitle}>
            Simple pricing for agencies that scale
          </h2>
          <div className={styles.pricingCard}>
            <p className={styles.sectionLead}>
              Pay per workspace, not per call. Bring as many clients as you
              like.
            </p>
            <Link href={signUpUrl} className={styles.pricingLink}>
              See pricing
              <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalCtaInner}>
          <h2 className={styles.finalCtaTitle}>
            Your clients are missing calls right now.
          </h2>
          <p className={styles.finalCtaLead}>
            Ultravoyce gives you the tools to fix that — and the business model
            to profit from it.
          </p>
          <Link
            href={signUpUrl}
            className={`${styles.primaryBtn} ${styles.primaryBtnLg}`}
          >
            Start building for free
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
