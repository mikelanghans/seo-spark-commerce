import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TOUR_STEPS, type TourCompletion, type TourStep, type ProductsTab } from "./steps";

const LS_KEY = "brand_aura_guided_tour_v1";

interface PersistedState {
  active: boolean;
  stepIndex: number;
  dismissed?: boolean;
}

type NavigateFn = (target: {
  view?: TourStep["navigateTo"];
  productsTab?: ProductsTab;
}) => void;

interface GuidedTourContextValue {
  steps: TourStep[];
  active: boolean;
  stepIndex: number;
  currentStep: TourStep | null;
  completion: TourCompletion;
  completedSteps: Set<string>;
  start: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  goTo: (id: string) => void;
  refresh: () => void;
}

const Ctx = createContext<GuidedTourContextValue | null>(null);

export function useGuidedTour() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGuidedTour must be used within GuidedTourProvider");
  return ctx;
}

interface ProviderProps {
  userId: string | null;
  selectedOrgId: string | null;
  onNavigate: NavigateFn;
  children: React.ReactNode;
}

const loadPersisted = (): PersistedState => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { active: false, stepIndex: 0 };
};

const savePersisted = (s: PersistedState) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
};

export function GuidedTourProvider({ userId, selectedOrgId, onNavigate, children }: ProviderProps) {
  const persistedRef = useRef<PersistedState>(loadPersisted());
  const [active, setActive] = useState(persistedRef.current.active);
  const [stepIndex, setStepIndex] = useState(persistedRef.current.stepIndex);
  const [completion, setCompletion] = useState<TourCompletion>({
    hasBrand: false,
    selectedBrand: false,
    hasProduct: false,
    hasListing: false,
    hasMarketplace: false,
  });

  // Persist on change
  useEffect(() => {
    savePersisted({ active, stepIndex });
  }, [active, stepIndex]);

  // Track selected brand independently of DB
  useEffect(() => {
    setCompletion((c) => ({ ...c, selectedBrand: !!selectedOrgId }));
  }, [selectedOrgId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [orgsRes, productsRes, listingsRes, shopifyRes, printifyRes, etsyRes, ebayRes] = await Promise.all([
        supabase.from("organizations").select("id").is("deleted_at", null).limit(1),
        supabase.from("products").select("id").limit(1),
        supabase.from("listings").select("id").limit(1),
        supabase.from("shopify_connections").select("id").eq("user_id", userId).limit(1),
        supabase.from("organization_secrets").select("id").not("printify_token_encrypted", "is", null).limit(1),
        supabase.from("etsy_connections").select("id").eq("user_id", userId).limit(1),
        supabase.from("ebay_connections").select("id").eq("user_id", userId).limit(1),
      ]);
      const hasMarketplace =
        (shopifyRes.data?.length ?? 0) > 0 ||
        (printifyRes.data?.length ?? 0) > 0 ||
        (etsyRes.data?.length ?? 0) > 0 ||
        (ebayRes.data?.length ?? 0) > 0;
      setCompletion((c) => ({
        ...c,
        hasBrand: (orgsRes.data?.length ?? 0) > 0,
        hasProduct: (productsRes.data?.length ?? 0) > 0,
        hasListing: (listingsRes.data?.length ?? 0) > 0,
        hasMarketplace,
      }));
    } catch (err) {
      console.error("Guided tour refresh failed:", err);
    }
  }, [userId]);

  // Refresh on user load + every 8s while active
  useEffect(() => { if (userId) refresh(); }, [userId, refresh]);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
  }, [active, refresh]);

  // Auto-advance when current step's auto-complete flag flips true
  const currentStep = active ? TOUR_STEPS[stepIndex] ?? null : null;
  useEffect(() => {
    if (!active || !currentStep?.autoComplete) return;
    if (completion[currentStep.autoComplete]) {
      const t = window.setTimeout(() => {
        setStepIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1));
      }, 800);
      return () => window.clearTimeout(t);
    }
  }, [active, currentStep, completion]);

  const completedSteps = useMemo(() => {
    const set = new Set<string>();
    for (const s of TOUR_STEPS) {
      if (s.autoComplete && completion[s.autoComplete]) set.add(s.id);
    }
    return set;
  }, [completion]);

  const navigateForStep = useCallback((step: TourStep | null) => {
    if (!step) return;
    onNavigate({ view: step.navigateTo, productsTab: step.productsTab });
  }, [onNavigate]);

  const start = useCallback(() => {
    // Pick first incomplete step
    const firstIncomplete = TOUR_STEPS.findIndex((s) => !s.autoComplete || !completion[s.autoComplete]);
    const idx = firstIncomplete === -1 ? 0 : firstIncomplete;
    setStepIndex(idx);
    setActive(true);
    refresh();
    navigateForStep(TOUR_STEPS[idx]);
  }, [completion, navigateForStep, refresh]);

  const stop = useCallback(() => setActive(false), []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      const ni = Math.min(i + 1, TOUR_STEPS.length - 1);
      navigateForStep(TOUR_STEPS[ni]);
      if (ni === i && i === TOUR_STEPS.length - 1) {
        setActive(false);
      }
      return ni;
    });
  }, [navigateForStep]);

  const prev = useCallback(() => {
    setStepIndex((i) => {
      const ni = Math.max(i - 1, 0);
      navigateForStep(TOUR_STEPS[ni]);
      return ni;
    });
  }, [navigateForStep]);

  const goTo = useCallback((id: string) => {
    const idx = TOUR_STEPS.findIndex((s) => s.id === id);
    if (idx < 0) return;
    setStepIndex(idx);
    setActive(true);
    navigateForStep(TOUR_STEPS[idx]);
  }, [navigateForStep]);

  const value: GuidedTourContextValue = {
    steps: TOUR_STEPS,
    active,
    stepIndex,
    currentStep,
    completion,
    completedSteps,
    start,
    stop,
    next,
    prev,
    goTo,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
