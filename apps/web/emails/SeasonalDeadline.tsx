import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Heading,
  Hr,
  Preview,
  Section,
  Row,
  Column,
} from '@react-email/components';

export interface CampaignRecommendation {
  campaignName: string;
  action: string;
}

export interface SeasonalDeadlineProps {
  eventName: string;
  weeksUntil: number;
  recommendations: CampaignRecommendation[];
  dashboardUrl?: string;
}

/**
 * SeasonalDeadline email template.
 *
 * Sent when a retail event is within 6 weeks and budget adjustments
 * should be made for optimal performance.
 *
 * Subject: "{eventName} in {weeksUntil} weeks — prepare your campaigns"
 *
 * Per user decision: "Email notifications for seasonal deadlines only"
 */
export function SeasonalDeadline({
  eventName,
  weeksUntil,
  recommendations,
  dashboardUrl = 'https://app.incremental-iq.com/seasonality',
}: SeasonalDeadlineProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>
        {eventName} in {weeksUntil} weeks — prepare your campaigns
      </Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Heading style={{ color: '#111827', fontSize: '20px', fontWeight: '600', margin: '0 0 8px' }}>
            {eventName} is {weeksUntil} {weeksUntil === 1 ? 'week' : 'weeks'} away
          </Heading>

          <Text style={{ color: '#374151', fontSize: '15px', lineHeight: '1.6', margin: '0 0 24px' }}>
            Based on your historical performance data, here are the recommended budget
            adjustments to maximize incremental lift during {eventName}.
          </Text>

          {recommendations.length > 0 && (
            <Section style={{ backgroundColor: '#f3f4f6', borderRadius: '6px', padding: '16px', margin: '0 0 24px' }}>
              <Text style={{ color: '#111827', fontSize: '13px', fontWeight: '600', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Campaign Recommendations
              </Text>
              {recommendations.map((rec, i) => (
                <Row key={i} style={{ marginBottom: i < recommendations.length - 1 ? '8px' : 0 }}>
                  <Column style={{ width: '60%' }}>
                    <Text style={{ color: '#374151', fontSize: '14px', margin: 0, fontWeight: '500' }}>
                      {rec.campaignName}
                    </Text>
                  </Column>
                  <Column style={{ width: '40%', textAlign: 'right' }}>
                    <Text style={{ color: '#2563eb', fontSize: '14px', margin: 0 }}>
                      {rec.action}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          <Section style={{ textAlign: 'center', margin: '0 0 32px' }}>
            <Button
              href={dashboardUrl}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '600',
                padding: '12px 28px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              View Seasonality Planning
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: '0 0 24px' }} />

          <Text style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
            You received this email because seasonal deadline alerts are enabled for your account.
            You can manage notification preferences in your dashboard settings.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SeasonalDeadline;
