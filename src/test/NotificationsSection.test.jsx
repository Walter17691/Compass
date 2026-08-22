import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationsSection } from '../screens/settings/NotificationsSection.jsx';

// Phase 6.5 hardening (Batch 13) — the webhook type select and webhook
// URL field had no accessible name at all (a placeholder on the URL
// field, nothing on the select). Had no test coverage at all before this.
const noop = () => {};

describe('NotificationsSection — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the webhook type select and the webhook URL field', () => {
    render(<NotificationsSection dueSoon={[]} caseTasks={[]} createCaseTask={noop} requestNotifications={noop} notifGranted={false} emailDigestOptIn={false} toggleEmailDigest={noop} orgWebhookUrl="" orgWebhookType="slack" saveOrgWebhook={noop} sendTestWebhook={noop} />);
    expect(screen.getByLabelText('Webhook type')).toBeInTheDocument();
    expect(screen.getByLabelText('Webhook URL')).toBeInTheDocument();
  });
});
