import { BarChart3, Database, Cpu, CheckCircle2 } from 'lucide-react';

export interface SetupStep {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

export interface FirstTimeExperienceProps {
  /** Overall progress percentage (0–100) */
  progressPct?: number;
  /** Estimated hours until first analysis is ready */
  hoursUntilReady?: number;
  steps?: SetupStep[];
}

const DEFAULT_STEPS: SetupStep[] = [
  {
    id: 'connect',
    label: 'Connect ad platforms',
    description: 'Link your Meta Ads, Google Ads, or Shopify store',
    complete: false,
    icon: Database,
  },
  {
    id: 'sync',
    label: 'Data syncing',
    description: 'Pulling 90 days of historical campaign metrics',
    complete: false,
    icon: BarChart3,
  },
  {
    id: 'analysis',
    label: 'First analysis run',
    description: 'Computing incrementality scores and recommendations',
    complete: false,
    icon: Cpu,
  },
];

/**
 * FirstTimeExperience — shown on the executive overview when no scoring data
 * exists yet (first time after account creation + platform connection).
 *
 * Shows:
 *   - A progress bar with percentage and estimated ETA
 *   - Step-by-step setup status (connect → sync → analyze)
 *   - Helpful onboarding messaging
 *
 * Per design spec: "First-time experience: Progress dashboard showing setup status"
 */
export function FirstTimeExperience({
  progressPct = 0,
  hoursUntilReady,
  steps = DEFAULT_STEPS,
}: FirstTimeExperienceProps) {
  const completedSteps = steps.filter((s) => s.complete).length;
  const currentStep = steps.find((s) => !s.complete);

  return (
    <div className="rounded-lg border bg-card p-6 sm:p-8">
      <div className="mx-auto max-w-lg space-y-6 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full bg-blue-100 p-4 dark:bg-blue-900/30">
            <Cpu className="h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </div>
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            Setting up your analytics
          </h2>
          {hoursUntilReady != null ? (
            <p className="text-sm text-muted-foreground">
              First analysis ready in approximately{' '}
              <span className="font-medium text-foreground">
                {hoursUntilReady} {hoursUntilReady === 1 ? 'hour' : 'hours'}
              </span>
            </p>
          ) : currentStep ? (
            <p className="text-sm text-muted-foreground">
              Currently: <span className="font-medium text-foreground">{currentStep.label}</span>
            </p>
          ) : null}
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Setup progress</span>
            <span>{progressPct}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-[400ms]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {completedSteps} of {steps.length} steps complete
          </p>
        </div>

        {/* Step list */}
        <div className="space-y-3 text-left">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = !step.complete && step.id === currentStep?.id;
            return (
              <div key={step.id} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                    step.complete
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                      : isActive
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'border-muted bg-muted/30'
                  }`}
                >
                  {step.complete ? (
                    <CheckCircle2
                      className="h-4 w-4 text-emerald-500"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon
                      className={`h-3.5 w-3.5 ${
                        isActive ? 'text-blue-500' : 'text-muted-foreground'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      step.complete
                        ? 'text-muted-foreground line-through'
                        : isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
