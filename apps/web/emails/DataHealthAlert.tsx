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
} from '@react-email/components';

export interface DataHealthAlertProps {
  integrationName: string;
  staleDays: number;
  reconnectUrl: string;
}

/**
 * DataHealthAlert email template.
 *
 * Sent when an integration has not synced successfully for >24 hours.
 *
 * Subject: "Action required: {integrationName} data is {staleDays} days stale"
 *
 * Per user decision: "Email notifications for data health issues"
 */
export function DataHealthAlert({
  integrationName,
  staleDays,
  reconnectUrl,
}: DataHealthAlertProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>
        Action required: {integrationName} data is {staleDays} days stale
      </Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Heading style={{ color: '#111827', fontSize: '20px', fontWeight: '600', margin: '0 0 16px' }}>
            Data sync issue detected
          </Heading>

          <Text style={{ color: '#374151', fontSize: '15px', lineHeight: '1.6', margin: '0 0 16px' }}>
            Your <strong>{integrationName}</strong> integration has not synced successfully
            in the last <strong>{staleDays} {staleDays === 1 ? 'day' : 'days'}</strong>.
            Dashboard metrics may be out of date.
          </Text>

          <Text style={{ color: '#374151', fontSize: '15px', lineHeight: '1.6', margin: '0 0 24px' }}>
            Reconnect your account to restore automatic data syncing and keep your
            recommendations accurate.
          </Text>

          <Section style={{ textAlign: 'center', margin: '0 0 32px' }}>
            <Button
              href={reconnectUrl}
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
              Reconnect {integrationName}
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: '0 0 24px' }} />

          <Text style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
            You received this email because data health alerts are enabled for your account.
            You can manage notification preferences in your dashboard settings.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DataHealthAlert;
