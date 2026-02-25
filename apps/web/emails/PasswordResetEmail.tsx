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

export interface PasswordResetEmailProps {
  resetUrl: string;
}

/**
 * PasswordResetEmail — sent when a user requests a password reset.
 *
 * Subject: "Reset your Incremental IQ password"
 *
 * The link expires in 1 hour (resetPasswordTokenExpiresIn: 3600 in auth.ts).
 * Better Auth handles token generation, single-use enforcement, and timing-safe comparison.
 */
export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Reset your Incremental IQ password — link expires in 1 hour</Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'sans-serif', margin: 0 }}>
        <Container
          style={{
            maxWidth: '560px',
            margin: '40px auto',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            padding: '40px',
          }}
        >
          <Heading
            style={{
              color: '#111827',
              fontSize: '20px',
              fontWeight: '600',
              margin: '0 0 16px',
            }}
          >
            Reset your password
          </Heading>

          <Text
            style={{
              color: '#374151',
              fontSize: '15px',
              lineHeight: '1.6',
              margin: '0 0 16px',
            }}
          >
            We received a request to reset the password for your Incremental IQ account.
            Click the button below to set a new password.
          </Text>

          <Text
            style={{
              color: '#374151',
              fontSize: '15px',
              lineHeight: '1.6',
              margin: '0 0 24px',
            }}
          >
            This link expires in <strong>1 hour</strong>. If you did not request a password
            reset, you can safely ignore this email — your password will not change.
          </Text>

          <Section style={{ textAlign: 'center', margin: '0 0 32px' }}>
            <Button
              href={resetUrl}
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
              Reset password
            </Button>
          </Section>

          <Text
            style={{
              color: '#6b7280',
              fontSize: '13px',
              lineHeight: '1.6',
              margin: '0 0 16px',
            }}
          >
            Or copy and paste this URL into your browser:
            <br />
            <span style={{ color: '#2563eb', wordBreak: 'break-all' }}>{resetUrl}</span>
          </Text>

          <Hr style={{ borderColor: '#e5e7eb', margin: '0 0 24px' }} />

          <Text style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
            You received this email because a password reset was requested for your
            Incremental IQ account. If you did not make this request, please contact support.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;
