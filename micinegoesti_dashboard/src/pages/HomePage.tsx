import { useQuery } from "@tanstack/react-query";
import { motion, useMotionTemplate, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type TransitionEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { CategoryTabs } from "../components/CategoryTabs";
import { ProductCard } from "../components/ProductCard";
import { ProductSkeletons } from "../components/Skeletons";

const OFFER_SLUG = "oferta-zilei";

const heroImage = "/assets/brand/final-version.png";
const heroFloatOne = "/assets/brand/floating-thing-1.png";
const heroFloatTwo = "/assets/brand/Floating-thing-2.png";
const heroFloatThree = "/assets/brand/floating-thing-3.png";
const heroFloatFour = "/assets/brand/floating-thing-4.png";
const tickerText = "Comandă acum - te așteptăm cu preparate proaspete!";
const team = [
  { name: "Luminița", image: "/feedback-flow/img/employees/Luminita.png" },
  { name: "Paula", image: "/feedback-flow/img/employees/Paula.png" },
  { name: "Roxana", image: "/feedback-flow/img/employees/Roxana1.png" },
  { name: "Ștefania", image: "/feedback-flow/img/employees/Stefania.png" },
  { name: "Cori", image: "/feedback-flow/img/employees/Cori-1.png" }
];
const extendedTeam = [...team, ...team, ...team];
const TEAM_AUTOPLAY_MS = 3200;
const TEAM_TRANSITION_MS = 600;
const TEAM_TRANSITION_FALLBACK_MS = TEAM_TRANSITION_MS + 100;

function normalizeTeamRailPosition(position: number) {
  const memberIndex = ((position % team.length) + team.length) % team.length;
  return team.length + memberIndex;
}

export function HomePage() {
  const menuCategories = useQuery({ queryKey: ["home-categories"], queryFn: () => api.categories() });
  const withOfferTab = menuCategories.data
    ? {
        categories: menuCategories.data.categories.some((category) => category.slug === OFFER_SLUG)
          ? menuCategories.data.categories
          : [...menuCategories.data.categories, { id: OFFER_SLUG, slug: OFFER_SLUG, label: "Oferta zilei", sortOrder: 9999, isActive: true }]
      }
    : undefined;
  const [menuCategory, setMenuCategory] = useState<string | undefined>(undefined);
  const [teamIndex, setTeamIndex] = useState(0);
  const [teamRailPosition, setTeamRailPosition] = useState(team.length);
  const [teamTransitionEnabled, setTeamTransitionEnabled] = useState(false);
  const [teamStep, setTeamStep] = useState(0);
  const teamTrackRef = useRef<HTMLDivElement | null>(null);
  const teamAutoplayRef = useRef<number | null>(null);
  const teamTransitionFallbackRef = useRef<number | null>(null);
  const teamPausedRef = useRef(false);
  const teamAnimatingRef = useRef(false);
  const teamTeleportingRef = useRef(false);
  const heroRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });

  const tableRotateRaw = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? ["0deg", "0deg"] : ["-10deg", "36deg"]);
  const tableYRaw = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? ["0px", "0px"] : ["0px", "180px"]);
  const tableScaleRaw = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [1, 1] : [1.04, 0.86]);

  const tableRotate = useSpring(tableRotateRaw, { stiffness: 90, damping: 22, mass: 0.35 });
  const tableY = useSpring(tableYRaw, { stiffness: 90, damping: 24, mass: 0.35 });
  const tableScale = useSpring(tableScaleRaw, { stiffness: 90, damping: 24, mass: 0.35 });
  const tableRevealRaw = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [45, 20] : [50, 0]);
  const tableReveal = useSpring(tableRevealRaw, { stiffness: 92, damping: 24, mass: 0.34 });
  const tableClipPath = useMotionTemplate`inset(0% 0% ${tableReveal}% 0%)`;

  const sideYRaw = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? ["0px", "0px"] : ["0px", "-48px"]);
  const sideY = useSpring(sideYRaw, { stiffness: 95, damping: 26, mass: 0.3 });

  const floatYRaw = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? ["0px", "0px"] : ["0px", "-24px"]);
  const floatY = useSpring(floatYRaw, { stiffness: 88, damping: 24, mass: 0.32 });

  useEffect(() => {
    if (!menuCategory && withOfferTab?.categories.length) {
      setMenuCategory(withOfferTab.categories[0].slug);
    }
  }, [menuCategory, withOfferTab]);

  const menuProducts = useQuery({
    queryKey: ["home-products", menuCategory],
    queryFn: () => (menuCategory === OFFER_SLUG ? api.products(undefined) : api.products(menuCategory)),
    enabled: Boolean(menuCategory)
  });

  const menuProductsToRender =
    menuCategory === OFFER_SLUG
      ? getOfferProducts(menuProducts.data?.products ?? [])
      : (menuProducts.data?.products ?? []);

  const getTeamStep = useCallback(() => {
    const track = teamTrackRef.current;
    const first = track?.querySelector<HTMLElement>(".emp3__card");
    if (!track || !first) return 0;
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    return first.offsetWidth + gap;
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    const update = () => {
      window.cancelAnimationFrame(animationFrame);
      setTeamTransitionEnabled(false);
      setTeamStep(getTeamStep());
      animationFrame = window.requestAnimationFrame(() => setTeamTransitionEnabled(true));
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", update);
    };
  }, [getTeamStep]);

  const stopTeamAutoplay = useCallback(() => {
    if (teamAutoplayRef.current !== null) {
      window.clearInterval(teamAutoplayRef.current);
      teamAutoplayRef.current = null;
    }
  }, []);

  const clearTeamTransitionFallback = useCallback(() => {
    if (teamTransitionFallbackRef.current !== null) {
      window.clearTimeout(teamTransitionFallbackRef.current);
      teamTransitionFallbackRef.current = null;
    }
  }, []);

  const finishTeamTransition = useCallback(() => {
    clearTeamTransitionFallback();
    teamAnimatingRef.current = false;

    setTeamRailPosition((current) => {
      const normalized = normalizeTeamRailPosition(current);
      if (normalized !== current) {
        teamTeleportingRef.current = true;
        setTeamTransitionEnabled(false);
        return normalized;
      }

      teamTeleportingRef.current = false;
      return current;
    });
  }, [clearTeamTransitionFallback]);

  const beginTeamTransition = useCallback(() => {
    if (teamAnimatingRef.current || teamTeleportingRef.current) return false;

    teamAnimatingRef.current = true;
    setTeamTransitionEnabled(true);
    clearTeamTransitionFallback();
    teamTransitionFallbackRef.current = window.setTimeout(
      finishTeamTransition,
      prefersReducedMotion ? 0 : TEAM_TRANSITION_FALLBACK_MS
    );
    return true;
  }, [clearTeamTransitionFallback, finishTeamTransition, prefersReducedMotion]);

  const startTeamAutoplay = useCallback(() => {
    stopTeamAutoplay();
    if (prefersReducedMotion) return;
    teamAutoplayRef.current = window.setInterval(() => {
      if (teamPausedRef.current || !beginTeamTransition()) return;
      setTeamIndex((current) => (current + 1) % team.length);
      setTeamRailPosition((current) => current + 1);
    }, TEAM_AUTOPLAY_MS);
  }, [beginTeamTransition, prefersReducedMotion, stopTeamAutoplay]);

  const goToNextTeamMember = useCallback(() => {
    if (!beginTeamTransition()) return;
    stopTeamAutoplay();
    setTeamRailPosition((current) => current + 1);
    setTeamIndex((current) => (current + 1) % team.length);
    startTeamAutoplay();
  }, [beginTeamTransition, startTeamAutoplay, stopTeamAutoplay]);

  const goToPreviousTeamMember = useCallback(() => {
    if (!beginTeamTransition()) return;
    stopTeamAutoplay();
    setTeamRailPosition((current) => current - 1);
    setTeamIndex((current) => (current - 1 + team.length) % team.length);
    startTeamAutoplay();
  }, [beginTeamTransition, startTeamAutoplay, stopTeamAutoplay]);

  const goToTeamMember = useCallback((index: number) => {
    if (!beginTeamTransition()) return;
    stopTeamAutoplay();
    setTeamIndex(index);
    setTeamRailPosition(team.length + index);
    startTeamAutoplay();
  }, [beginTeamTransition, startTeamAutoplay, stopTeamAutoplay]);

  const handleTeamTransitionEnd = useCallback((event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== teamTrackRef.current) return;
    finishTeamTransition();
  }, [finishTeamTransition]);

  useEffect(() => {
    if (teamTransitionEnabled) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setTeamTransitionEnabled(true);
        teamTeleportingRef.current = false;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [teamTransitionEnabled]);

  useEffect(() => {
    startTeamAutoplay();
    return stopTeamAutoplay;
  }, [startTeamAutoplay, stopTeamAutoplay]);

  useEffect(() => clearTeamTransitionFallback, [clearTeamTransitionFallback]);

  return (
    <>
      <section ref={heroRef} className="hero food-banner-section hero-section">
        <div className="hero-grid">
          <motion.div className="hero-copy" style={{ y: sideY }}>
            <span className="eyebrow hero-eyebrow">Arome autentice, mâncare delicioasă</span>
            <h1 className="hero-title">Gustul tradiției, direct de pe grătar</h1>
            <p className="hero-subtitle">Gustul tradiției renăscut: micii autentici din Negoești, făcuți cu pasiune și rețeta bunicului.</p>
            <div className="hero-actions">
              <Link className="primary-button hero-cta" to="/menu">Comandă acum</Link>
            </div>
          </motion.div>

          <div className="hero-table-positioner">
            <motion.div className="hero-table-mask" style={{ clipPath: tableClipPath }}>
              <motion.div className="hero-table-orbit" style={{ rotate: tableRotate, y: tableY, scale: tableScale }}>
                <img src={heroImage} alt="Masa cu preparate Mici de Negoești" />
              </motion.div>
            </motion.div>
          </div>

          <motion.aside className="hero-review-copy" style={{ y: sideY }} aria-label="Recenzii">
            <span>Recenzii</span>
            <p>Cei mai buni mici pe care i-am mâncat vreodată! Gust autentic, suculent și exact ca pe vremuri.</p>
          </motion.aside>

          <motion.div className="hero-feature-stack" style={{ y: sideY }} aria-label="Valori">
            <article className="hero-feature-copy">
              <h3>Rețetă de familie</h3>
              <p>Rețeta bunicului, păstrată autentic.</p>
            </article>
            <article className="hero-feature-copy">
              <h3>Fără compromisuri</h3>
              <p>Ingrediente naturale, fără aditivi.</p>
            </article>
          </motion.div>

          <motion.img className="hero-float hero-float-fries" style={{ y: floatY }} src={heroFloatOne} alt="" aria-hidden="true" />
          <motion.img className="hero-float hero-float-sauce-left" style={{ y: floatY }} src={heroFloatThree} alt="" aria-hidden="true" />
          <motion.img className="hero-float hero-float-sauce-right" style={{ y: floatY }} src={heroFloatTwo} alt="" aria-hidden="true" />
          <motion.img className="hero-float hero-float-ember" style={{ y: floatY }} src={heroFloatFour} alt="" aria-hidden="true" />
        </div>
      </section>

      <section className="ticker" aria-label="Anunț comandă">
        <div className="ticker-track">
          {Array.from({ length: 12 }).map((_, index) => (
            <span className="ticker-item" key={`ticker-a-${index}`}>{tickerText}</span>
          ))}
        </div>
        <div className="ticker-track" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, index) => (
            <span className="ticker-item" key={`ticker-b-${index}`}>{tickerText}</span>
          ))}
        </div>
      </section>

      <section className="home-menu-section">
        <div className="section-shell compact">
          <div className="section-title">
            <span>Meniu complet</span>
            <h2>Alege preparatele preferate</h2>
          </div>
        </div>
        {withOfferTab && (
          <CategoryTabs
            categories={withOfferTab.categories}
            active={menuCategory}
            onChange={setMenuCategory}
          />
        )}
        <div className="section-shell">
          {menuProducts.isLoading ? (
            <ProductSkeletons />
          ) : (
            <div className={`product-grid${menuCategory === OFFER_SLUG ? " product-grid-offer" : ""}`}>
              {menuProductsToRender.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          )}
          <div className="hero-actions" style={{ justifyContent: "center", marginTop: 18 }}>
            <Link className="primary-button" to="/menu">Vezi meniul complet</Link>
          </div>
        </div>
      </section>

      <section className="section-shell feedback-flow-launch-wrap">
        <div className="feedback-flow-launch">
          <h3>Părerea ta contează</h3>
          <p>Ne ia 1 minut să o citim.<br />Ție 1 minut să o scrii.</p>
          <Link className="primary-button" to="/feedback">Lasă feedback</Link>
        </div>
      </section>

      <section className="section-shell emp3" aria-label="Echipa">
        <div className="emp3__head">
          <h2 className="emp3__title">Echipa care gătește și servește</h2>

          <div className="emp3__controls">
            <button className="emp3__btn" type="button" id="emp3Prev" aria-label="Înapoi" onClick={goToPreviousTeamMember}>
              <span aria-hidden="true">‹</span>
            </button>
            <button className="emp3__btn" type="button" id="emp3Next" aria-label="Înainte" onClick={goToNextTeamMember}>
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>

        <div
          className="emp3__rail"
          id="emp3Rail"
          tabIndex={0}
          aria-label="Carusel echipă"
          onMouseEnter={() => { teamPausedRef.current = true; }}
          onMouseLeave={() => { teamPausedRef.current = false; }}
          onFocus={() => { teamPausedRef.current = true; }}
          onBlur={() => { teamPausedRef.current = false; }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              goToPreviousTeamMember();
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              goToNextTeamMember();
            }
          }}
        >
          <div
            className="emp3__track"
            ref={teamTrackRef}
            onTransitionEnd={handleTeamTransitionEnd}
            style={{
              transform: `translateX(-${teamRailPosition * teamStep}px)`,
              transition: teamTransitionEnabled ? `transform ${TEAM_TRANSITION_MS}ms ease` : "none"
            }}
          >
            {extendedTeam.map((member, index) => (
              <article
                className={`emp3__card${index === teamRailPosition ? " is-active" : ""}`}
                key={`${member.name}-${index}`}
                onClick={() => goToTeamMember(index % team.length)}
              >
                <div className="emp3__media">
                  <img src={member.image} alt={member.name} loading="lazy" decoding="async" width={1200} height={900} />
                </div>
                <div className="emp3__meta"><div className="emp3__name">{member.name}</div></div>
              </article>
            ))}
          </div>
        </div>
        <div className="emp3__footer">
          <div className="emp3__dots" id="emp3Dots" aria-label="Navigare carusel">
            {team.map((member, index) => (
              <button
                key={member.name}
                type="button"
                className="emp3__dot"
                aria-label={`Mergi la cardul ${index + 1}`}
                aria-current={index === teamIndex}
                onClick={() => goToTeamMember(index)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell ygh-about-compact" aria-label="Despre noi">
        <article className="ygh-card ygh-hero-card">
          <span className="ygh-badge">🔥 Gust autentic. Fără compromisuri.</span>
          <h2>Despre noi</h2>
          <p>
            La <strong>Your Grill House</strong>, punem pe grătar mai mult decât mâncare bună: tradiție,
            ingrediente bune și un gust care te face să revii.
          </p>
          <div className="ygh-about-mini-points">
            <span>🥩 Ingrediente bune</span>
            <span>🌿 Tradiție reinterpretată</span>
            <span>⚡ Proaspăt și rapid</span>
          </div>
        </article>
      </section>

    </>
  );
}

function getOfferProducts(products: Awaited<ReturnType<typeof api.products>>["products"]) {
  const explicitOffer = products.filter((product) =>
    product.categories.some((category) => category.slug === OFFER_SLUG || /oferta/i.test(category.slug) || /oferta/i.test(category.label))
  );

  if (explicitOffer.length) return explicitOffer;

  return products.filter((product) => product.isAvailable).slice(0, 8);
}
