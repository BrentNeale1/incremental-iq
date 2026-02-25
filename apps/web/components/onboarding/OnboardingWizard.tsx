'use client';

import * as React from 'react';
import { WizardStepper } from '@/components/onboarding/WizardStepper';
import { IntegrationConnectStep } from '@/components/onboarding/IntegrationConnectStep';
import { GA4EventSelector, GA4EventSelectorHandle } from '@/components/onboarding/GA4EventSelector';
import { BatchMarketConfirmation, BatchMarketHandle } from '@/components/onboarding/BatchMarketConfirmation';
import { OutcomeModeSelector } from '@/components/onboarding/OutcomeModeSelector';
import { OnboardingTransition } from '@/components/onboarding/OnboardingTransition';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WizardState {
  currentStep: 1 | 2 | 3 | 4;
  connectedIntegrations: Record<string, { integrationId: string }>;
  ga4IntegrationId: string | null;
  ga4PropertyId: string | null;
  ga4EventsSelected: boolean;
  marketsConfirmed: boolean;
  outcomeMode: 'ecommerce' | 'lead_gen' | null;
  isCompleting: boolean;
  showTransition: boolean;
}

interface GA4Property {
  propertyId: string;
  displayName: string;
}


/**
 * OnboardingWizard — 4-step wizard state machine.
 *
 * Steps:
 *   1. Connect integrations (OAuth popup per platform)
 *   2. Select GA4 events (or skip if GA4 not connected)
 *   3. Confirm markets (batch-save wrapper — no API calls until Next)
 *   4. Select outcome mode (ecommerce vs lead_gen)
 *
 * On mount: fetches /api/onboarding/status and /api/integrations/status
 * to restore wizard state for mid-onboarding return visits.
 *
 * On completion: POSTs to /api/onboarding/complete then shows
 * OnboardingTransition which auto-redirects to dashboard after 10s.
 */
export function OnboardingWizard() {
  const [state, setState] = React.useState<WizardState>({
    currentStep: 1,
    connectedIntegrations: {},
    ga4IntegrationId: null,
    ga4PropertyId: null,
    ga4EventsSelected: false,
    marketsConfirmed: false,
    outcomeMode: null,
    isCompleting: false,
    showTransition: false,
  });
  const [loading, setLoading] = React.useState(true);
  const [ga4Properties, setGa4Properties] = React.useState<GA4Property[]>([]);
  const [ga4PropertiesLoading, setGa4PropertiesLoading] = React.useState(false);
  const [stepError, setStepError] = React.useState<string | null>(null);

  const batchMarketRef = React.useRef<BatchMarketHandle>(null);
  const ga4SelectorRef = React.useRef<GA4EventSelectorHandle>(null);

  // On mount: restore wizard state
  React.useEffect(() => {
    async function initialize() {
      try {
        const [statusRes, integrationsRes] = await Promise.all([
          fetch('/api/onboarding/status'),
          fetch('/api/integrations/status'),
        ]);

        const status = await statusRes.json() as {
          completed: boolean;
          connectedPlatforms: string[];
          ga4EventsSelected: boolean;
          marketsConfirmed: boolean;
          outcomeMode: string | null;
          suggestedStep: number;
        };

        const integrations = await integrationsRes.json() as Array<{
          platform: string;
          integrationId: string;
        }>;

        // Build connectedIntegrations map
        const connectedMap: Record<string, { integrationId: string }> = {};
        for (const intg of integrations) {
          if (intg.platform && intg.integrationId) {
            connectedMap[intg.platform] = { integrationId: intg.integrationId };
          }
        }

        // Find GA4 integration if connected
        const ga4Intg = integrations.find((i) => i.platform === 'ga4');

        const suggestedStep = Math.max(1, Math.min(4, status.suggestedStep ?? 1)) as 1 | 2 | 3 | 4;

        setState((prev) => ({
          ...prev,
          currentStep: suggestedStep,
          connectedIntegrations: connectedMap,
          ga4IntegrationId: ga4Intg?.integrationId ?? null,
          ga4EventsSelected: status.ga4EventsSelected,
          marketsConfirmed: status.marketsConfirmed,
          outcomeMode: (status.outcomeMode as 'ecommerce' | 'lead_gen' | null) ?? null,
        }));
      } catch (err) {
        console.error('Failed to initialize onboarding wizard:', err);
      } finally {
        setLoading(false);
      }
    }

    void initialize();
  }, []);

  // Fetch GA4 properties when GA4 integration is known
  React.useEffect(() => {
    if (!state.ga4IntegrationId) return;
    setGa4PropertiesLoading(true);
    fetch(`/api/ga4/properties?integrationId=${state.ga4IntegrationId}`)
      .then((r) => r.json())
      .then((data: GA4Property[] | { properties: GA4Property[] }) => {
        const props = Array.isArray(data) ? data : data.properties ?? [];
        setGa4Properties(props);
        // Auto-select if only one property
        if (props.length === 1 && !state.ga4PropertyId) {
          setState((prev) => ({ ...prev, ga4PropertyId: props[0].propertyId }));
        }
      })
      .catch((err) => console.error('Failed to fetch GA4 properties:', err))
      .finally(() => setGa4PropertiesLoading(false));
  }, [state.ga4IntegrationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIntegrationConnected = (platform: string, integrationId: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        connectedIntegrations: {
          ...prev.connectedIntegrations,
          [platform]: { integrationId },
        },
      };
      if (platform === 'ga4') {
        next.ga4IntegrationId = integrationId;
      }
      return next;
    });
  };

  // Compute completedSteps for stepper
  const completedSteps = React.useMemo((): Set<number> => {
    const steps = new Set<number>();
    const connected = Object.keys(state.connectedIntegrations);
    const hasCommerce = ['shopify', 'ga4'].some((p) => connected.includes(p));
    const hasPaidChannel = ['meta', 'google'].some((p) => connected.includes(p));

    if (hasCommerce && hasPaidChannel) steps.add(1);
    if (state.ga4EventsSelected || !state.ga4IntegrationId) steps.add(2);
    if (state.marketsConfirmed) steps.add(3);
    if (state.outcomeMode) steps.add(4);

    return steps;
  }, [state]);

  // Compute canProceed for current step
  const canProceedStep1 = React.useMemo(() => {
    const connected = Object.keys(state.connectedIntegrations);
    const hasCommerce = ['shopify', 'ga4'].some((p) => connected.includes(p));
    const hasPaidChannel = ['meta', 'google'].some((p) => connected.includes(p));
    return hasCommerce && hasPaidChannel;
  }, [state.connectedIntegrations]);

  const canProceedStep2 = !state.ga4IntegrationId || state.ga4EventsSelected || state.ga4PropertyId !== null;

  const canProceedStep3 = batchMarketRef.current?.canProceed ?? true;

  const canProceedStep4 = state.outcomeMode !== null;

  const handleBack = () => {
    setStepError(null);
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(1, prev.currentStep - 1) as 1 | 2 | 3 | 4,
    }));
  };

  const handleNext = async () => {
    setStepError(null);

    if (state.currentStep === 2 && state.ga4IntegrationId && state.ga4PropertyId) {
      // Trigger GA4EventSelector save via its own handleSave
      if (ga4SelectorRef.current) {
        try {
          await ga4SelectorRef.current.handleSave();
          setState((prev) => ({ ...prev, ga4EventsSelected: true }));
        } catch (err) {
          console.error('Failed to save GA4 events:', err);
          // Non-fatal — allow proceeding
        }
      }
    }

    if (state.currentStep === 3) {
      // Flush all batch market actions via single PUT /api/markets
      if (batchMarketRef.current) {
        try {
          await batchMarketRef.current.save();
          setState((prev) => ({ ...prev, marketsConfirmed: true }));
        } catch (err) {
          console.error('Failed to save markets:', err);
          setStepError('Failed to save markets. Please try again.');
          return;
        }
      }
    }

    if (state.currentStep === 4) {
      // Complete onboarding
      try {
        setState((prev) => ({ ...prev, isCompleting: true }));
        await fetch('/api/onboarding/complete', { method: 'POST' });
        setState((prev) => ({ ...prev, isCompleting: false, showTransition: true }));
      } catch (err) {
        console.error('Failed to complete onboarding:', err);
        setStepError('Failed to complete onboarding. Please try again.');
        setState((prev) => ({ ...prev, isCompleting: false }));
      }
      return;
    }

    setState((prev) => ({
      ...prev,
      currentStep: Math.min(4, prev.currentStep + 1) as 1 | 2 | 3 | 4,
    }));
  };

  // ---- Render ----

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-12 w-1/2" />
      </div>
    );
  }

  if (state.showTransition) {
    return (
      <OnboardingTransition
        connectedPlatforms={Object.keys(state.connectedIntegrations)}
      />
    );
  }

  const isLastStep = state.currentStep === 4;

  return (
    <div className="space-y-6">
      <WizardStepper
        currentStep={state.currentStep}
        completedSteps={completedSteps}
      />

      {/* Step content */}
      <div className="min-h-[400px]">
        {state.currentStep === 1 && (
          <IntegrationConnectStep
            connectedIntegrations={state.connectedIntegrations}
            onIntegrationConnected={handleIntegrationConnected}
          />
        )}

        {state.currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Select GA4 Events</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose the events that represent conversions or leads in your GA4 property.
              </p>
            </div>

            {!state.ga4IntegrationId ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  GA4 is not connected. You can add it later in Settings.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Click Next to skip this step.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* GA4 property selector */}
                {ga4PropertiesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : ga4Properties.length > 0 ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">GA4 Property</label>
                    <Select
                      value={state.ga4PropertyId ?? ''}
                      onValueChange={(value) =>
                        setState((prev) => ({ ...prev, ga4PropertyId: value }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a property..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ga4Properties.map((prop) => (
                          <SelectItem key={prop.propertyId} value={prop.propertyId}>
                            {prop.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No GA4 properties found. Ensure GA4 is connected with the correct permissions.
                  </p>
                )}

                {/* GA4 event selector — only shown when property is selected */}
                {state.ga4IntegrationId && state.ga4PropertyId && (
                  <GA4EventSelector
                    ref={ga4SelectorRef}
                    integrationId={state.ga4IntegrationId}
                    propertyId={state.ga4PropertyId}
                    hideActions
                    onSelectionChange={(has) =>
                      setState((prev) => ({ ...prev, ga4EventsSelected: has }))
                    }
                  />
                )}
              </div>
            )}
          </div>
        )}

        {state.currentStep === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Confirm Your Markets</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Review and edit detected markets. All changes save when you click Next.
              </p>
            </div>
            <BatchMarketConfirmation ref={batchMarketRef} />
          </div>
        )}

        {state.currentStep === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose Your Outcome Mode</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tell us what success looks like for your business.
              </p>
            </div>
            <OutcomeModeSelector
              onSelect={(mode) => setState((prev) => ({ ...prev, outcomeMode: mode }))}
              initialMode={state.outcomeMode ?? undefined}
            />
          </div>
        )}
      </div>

      {/* Error message */}
      {stepError && (
        <p className="text-sm text-destructive">{stepError}</p>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={state.currentStep === 1 || state.isCompleting}
        >
          Back
        </Button>

        <Button
          onClick={handleNext}
          disabled={
            (state.currentStep === 1 && !canProceedStep1) ||
            (state.currentStep === 2 && !canProceedStep2) ||
            (state.currentStep === 4 && !canProceedStep4) ||
            state.isCompleting
          }
        >
          {state.isCompleting
            ? 'Completing...'
            : isLastStep
            ? 'Complete'
            : 'Next'}
        </Button>
      </div>
    </div>
  );
}

