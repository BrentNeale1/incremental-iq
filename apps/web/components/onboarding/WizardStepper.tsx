'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  currentStep: 1 | 2 | 3 | 4;
  completedSteps: Set<number>;
}

const STEPS = [
  { number: 1, label: 'Connect' },
  { number: 2, label: 'Events' },
  { number: 3, label: 'Markets' },
  { number: 4, label: 'Mode' },
] as const;

/**
 * WizardStepper — horizontal step progress bar for the onboarding wizard.
 *
 * Visual states:
 *   - Completed step: green background with checkmark
 *   - Current step: primary color ring + bold label
 *   - Future step: muted/dimmed
 *
 * Separator lines between steps shift from primary to muted at the
 * boundary between completed and upcoming steps.
 */
export function WizardStepper({ currentStep, completedSteps }: Props) {
  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <ol className="flex items-center w-full">
        {STEPS.map((step, index) => {
          const isCompleted = completedSteps.has(step.number);
          const isCurrent = step.number === currentStep;
          const isFuture = step.number > currentStep && !isCompleted;
          const isLast = index === STEPS.length - 1;

          return (
            <React.Fragment key={step.number}>
              <li className="flex flex-col items-center flex-shrink-0">
                {/* Step circle */}
                <div
                  className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-full border-2 text-sm font-semibold transition-colors',
                    isCompleted && 'border-green-500 bg-green-500 text-white',
                    isCurrent && 'border-primary bg-primary text-primary-foreground',
                    isFuture && 'border-muted-foreground/30 bg-transparent text-muted-foreground/50',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" strokeWidth={3} />
                  ) : (
                    step.number
                  )}
                </div>
                {/* Step label */}
                <span
                  className={cn(
                    'mt-1.5 text-xs font-medium whitespace-nowrap',
                    isCompleted && 'text-green-600',
                    isCurrent && 'text-primary',
                    isFuture && 'text-muted-foreground/50',
                  )}
                >
                  {step.label}
                </span>
              </li>
              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 mb-4 transition-colors',
                    isCompleted ? 'bg-green-400' : 'bg-muted-foreground/20',
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
