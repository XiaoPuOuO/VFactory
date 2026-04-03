import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import {
  Paperclip,
  ArrowRight,
  LayoutDashboard,
  Bot,
  BarChart3,
  CheckCircle2,
  GitBranch,
  ShieldCheck,
  Zap,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { queryKeys } from "@/lib/queryKeys";

import "./Landing.css";

/**
 * Landing 頁面 — 對齊 Apple HIG：Clarity、Deference、Depth
 * 留白優先、材質（vibrancy/blur）、極淡陰影、無多餘裝飾。
 * 未登入時僅顯示「立即開始」；已登入顯示「前往儀表板」。
 */
export function Landing() {
  const { t } = useTranslation();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });
  const requireLogin = healthQuery.data?.deploymentMode === "authenticated";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
    enabled: requireLogin,
  });
  const isLoggedIn = Boolean(sessionQuery.data);

  const features = [
    {
      icon: LayoutDashboard,
      titleKey: "landing.featureDashboardTitle",
      descKey: "landing.featureDashboardDesc",
    },
    {
      icon: Bot,
      titleKey: "landing.featureAgentsTitle",
      descKey: "landing.featureAgentsDesc",
    },
    {
      icon: BarChart3,
      titleKey: "landing.featureInsightsTitle",
      descKey: "landing.featureInsightsDesc",
    },
    {
      icon: GitBranch,
      titleKey: "landing.featureProjectsTitle",
      descKey: "landing.featureProjectsDesc",
    },
    {
      icon: ShieldCheck,
      titleKey: "landing.featureApprovalsTitle",
      descKey: "landing.featureApprovalsDesc",
    },
    {
      icon: Workflow,
      titleKey: "landing.featureSchedulesTitle",
      descKey: "landing.featureSchedulesDesc",
    },
  ] as const;

  const stats = [
    { valueKey: "landing.statAgentsValue", labelKey: "landing.statAgentsLabel" },
    { valueKey: "landing.statTasksValue", labelKey: "landing.statTasksLabel" },
    { valueKey: "landing.statUptimeValue", labelKey: "landing.statUptimeLabel" },
  ] as const;

  const steps = [
    { titleKey: "landing.step1Title", descKey: "landing.step1Desc" },
    { titleKey: "landing.step2Title", descKey: "landing.step2Desc" },
    { titleKey: "landing.step3Title", descKey: "landing.step3Desc" },
  ] as const;

  const pricingPoints = [
    "landing.pricingPoint1",
    "landing.pricingPoint2",
    "landing.pricingPoint3",
  ] as const;

  const faqItems = [
    { qKey: "landing.faqQ1", aKey: "landing.faqA1" },
    { qKey: "landing.faqQ2", aKey: "landing.faqA2" },
    { qKey: "landing.faqQ3", aKey: "landing.faqA3" },
    { qKey: "landing.faqQ4", aKey: "landing.faqA4" },
  ] as const;

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link
            to="/landing"
            className="landing-logo-link"
            aria-label="VFactory"
          >
            <Paperclip className="landing-logo-icon" aria-hidden />
            <span className="landing-logo-text">VFactory</span>
          </Link>
          <nav className="landing-nav">
            {isLoggedIn ? (
              <Button asChild size="sm" className="landing-btn-primary">
                <Link to="/">
                  {t("landing.goToDashboard")}
                  <ArrowRight className="landing-btn-icon" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" className="landing-btn-primary">
                <Link to="/auth">{t("landing.getStarted")}</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-inner">
            <span className="landing-hero-badge landing-animate-in">
              <Zap className="landing-hero-badge-icon" />
              {t("landing.heroBadge")}
            </span>
            <h1 className="landing-hero-title landing-animate-in landing-animate-in-delay-1">
              {t("landing.heroTitle")}
            </h1>
            <p className="landing-hero-subtitle landing-animate-in landing-animate-in-delay-2">
              {t("landing.heroSubtitle")}
            </p>
            <ul className="landing-hero-values landing-animate-in landing-animate-in-delay-3">
              <li className="landing-hero-value-item">
                <CheckCircle2 className="landing-hero-value-icon" />
                {t("landing.valueProp1")}
              </li>
              <li className="landing-hero-value-item">
                <CheckCircle2 className="landing-hero-value-icon" />
                {t("landing.valueProp2")}
              </li>
              <li className="landing-hero-value-item">
                <CheckCircle2 className="landing-hero-value-icon" />
                {t("landing.valueProp3")}
              </li>
            </ul>
            <div className="landing-hero-actions landing-animate-in landing-animate-in-delay-4">
              {isLoggedIn ? (
                <Button asChild size="lg" className="landing-btn-cta">
                  <Link to="/">
                    {t("landing.goToDashboard")}
                    <ArrowRight className="landing-btn-icon" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" className="landing-btn-cta">
                  <Link to="/auth">{t("landing.getStarted")}</Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="landing-stats">
          <div className="landing-stats-inner">
            <div className="landing-stats-grid">
              {stats.map(({ valueKey, labelKey }) => (
                <div key={labelKey}>
                  <p className="landing-stat-value">{t(valueKey)}</p>
                  <p className="landing-stat-label">{t(labelKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-features">
          <div className="landing-features-inner">
            <p className="landing-section-label">
              {t("landing.featuresSectionLabel")}
            </p>
            <h2 className="landing-features-title">
              {t("landing.featuresSectionTitle")}
            </h2>
            <div className="landing-features-grid">
              {features.map(({ icon: Icon, titleKey, descKey }) => (
                <div key={titleKey} className="landing-card">
                  <div className="landing-feature-icon">
                    <Icon />
                  </div>
                  <h3 className="landing-feature-card-title">{t(titleKey)}</h3>
                  <p className="landing-feature-card-desc">{t(descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-pricing-transparency"
          aria-labelledby="landing-pricing-heading"
        >
          <div className="landing-pricing-inner">
            <h2 id="landing-pricing-heading" className="landing-pricing-title">
              {t("landing.pricingTransparencyTitle")}
            </h2>
            <p className="landing-pricing-lead">{t("landing.pricingTransparencyLead")}</p>
            <ul className="landing-pricing-list">
              {pricingPoints.map((key) => (
                <li key={key} className="landing-pricing-item">
                  <CheckCircle2 className="landing-pricing-icon" aria-hidden />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-how">
          <div className="landing-how-inner">
            <p className="landing-section-label">
              {t("landing.howItWorksLabel")}
            </p>
            <h2 className="landing-how-title">
              {t("landing.howItWorksTitle")}
            </h2>
            <div className="landing-steps">
              {steps.map(({ titleKey, descKey }, index) => (
                <div key={titleKey} className="landing-step-row">
                  <div className="landing-step-dot">{index + 1}</div>
                  <div>
                    <h3 className="landing-step-title">{t(titleKey)}</h3>
                    <p className="landing-step-desc">{t(descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-faq" aria-labelledby="landing-faq-heading">
          <div className="landing-faq-inner">
            <h2 id="landing-faq-heading" className="landing-faq-title">
              {t("landing.faqTitle")}
            </h2>
            <div className="landing-faq-list">
              {faqItems.map(({ qKey, aKey }) => (
                <details key={qKey} className="landing-faq-item">
                  <summary className="landing-faq-summary">{t(qKey)}</summary>
                  <p className="landing-faq-answer">{t(aKey)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-cta-inner">
            <h2 className="landing-cta-title">{t("landing.ctaTitle")}</h2>
            <p className="landing-cta-subtitle">{t("landing.ctaSubtitle")}</p>
            {isLoggedIn ? (
              <Button asChild size="lg" className="landing-btn-cta">
                <Link to="/">
                  {t("landing.goToDashboard")}
                  <ArrowRight className="landing-btn-icon" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="landing-btn-cta">
                <Link to="/auth">{t("landing.getStarted")}</Link>
              </Button>
            )}
          </div>
        </section>

        <footer className="landing-footer">
          <p className="landing-footer-note">{t("landing.footerNote")}</p>
        </footer>
      </main>
    </div>
  );
}
