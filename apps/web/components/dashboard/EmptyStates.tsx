import {
  BarChart3,
  CalendarDays,
  FlaskConical,
  LineChart,
  Bell,
  Database,
} from 'lucide-react';

/**
 * EmptyStates — contextual empty state components for each dashboard section.
 *
 * Each component includes:
 *   - A relevant lucide-react icon
 *   - A primary message explaining why the section is empty
 *   - A helpful guidance line
 *   - A rotating famous marketing/business quote
 *
 * Per user decision: "Empty state marketing quotes"
 */

const MARKETING_QUOTES = [
  { text: 'If you can\'t measure it, you can\'t improve it.', author: 'Peter Drucker' },
  { text: 'The best marketing doesn\'t feel like marketing.', author: 'Tom Fishburne' },
  {
    text: 'The aim of marketing is to know and understand the customer so well the product or service fits him and sells itself.',
    author: 'Peter Drucker',
  },
  {
    text: 'Half the money I spend on advertising is wasted; the trouble is I don\'t know which half.',
    author: 'John Wanamaker',
  },
  {
    text: 'Good marketing makes the company look smart. Great marketing makes the customer feel smart.',
    author: 'Joe Chernov',
  },
];

/** Returns a quote deterministically based on a seed to avoid hydration mismatch. */
function getQuote(seed: number) {
  return MARKETING_QUOTES[seed % MARKETING_QUOTES.length]!;
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  quoteSeed?: number;
}

function EmptyStateBase({
  icon,
  title,
  description,
  quoteSeed = 0,
}: EmptyStateProps) {
  const quote = getQuote(quoteSeed);

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border bg-card py-14 px-6 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">
        {icon}
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <blockquote className="max-w-xs border-l-2 border-muted pl-4 text-left">
        <p className="text-xs italic text-muted-foreground/80">&ldquo;{quote.text}&rdquo;</p>
        <footer className="mt-1 text-xs text-muted-foreground/60">— {quote.author}</footer>
      </blockquote>
    </div>
  );
}

/**
 * EmptyRecommendations — shown on Executive Overview when no recommendations exist.
 */
export function EmptyRecommendations() {
  return (
    <EmptyStateBase
      icon={<BarChart3 className="h-6 w-6" aria-hidden="true" />}
      title="No recommendations yet"
      description="The system will generate recommendations after your first scoring run. Connect your ad platforms to get started."
      quoteSeed={0}
    />
  );
}

/**
 * EmptyHoldoutTests — shown when no holdout tests are configured.
 */
export function EmptyHoldoutTests() {
  return (
    <EmptyStateBase
      icon={<FlaskConical className="h-6 w-6" aria-hidden="true" />}
      title="No holdout tests yet"
      description="The system will suggest a holdout test when statistical confidence is low on a campaign."
      quoteSeed={1}
    />
  );
}

/**
 * EmptySeasonality — shown on the Seasonality Planning page before events load.
 */
export function EmptySeasonality() {
  return (
    <EmptyStateBase
      icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}
      title="Seasonal planning activates 6 weeks before your first retail event"
      description="Connect your ad platforms to see upcoming event budget recommendations."
      quoteSeed={2}
    />
  );
}

/**
 * EmptyInsights — shown on the Statistical Insights page before analysis runs.
 */
export function EmptyInsights() {
  return (
    <EmptyStateBase
      icon={<LineChart className="h-6 w-6" aria-hidden="true" />}
      title="Statistical insights will appear after your first analysis run"
      description="The engine needs at least 30 days of campaign data to compute reliable incrementality scores."
      quoteSeed={3}
    />
  );
}

/**
 * EmptyHealth — shown on the Data Health page when no integrations are connected.
 */
export function EmptyHealth() {
  return (
    <EmptyStateBase
      icon={<Database className="h-6 w-6" aria-hidden="true" />}
      title="No integrations connected"
      description="Connect your first ad platform to start syncing data and measuring incremental lift."
      quoteSeed={4}
    />
  );
}

/**
 * EmptyNotifications — shown in the notification panel when there are no notifications.
 */
export function EmptyNotifications() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
      <Bell className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        No notifications yet — we&apos;ll alert you when something needs attention.
      </p>
    </div>
  );
}
