import { Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { NoticePage } from '../../components/layout/notice-page';
import { ButtonLink } from '../../components/ui';

export const metadata: Metadata = { title: 'Access denied | PMRMS' };

export default function UnauthorizedPage() {
  return (
    <NoticePage
      icon={Lock}
      eyebrow="Access denied"
      title="This area is not available to your account."
      description="Each role has its own workspace. Return to yours to continue."
      actions={<>
        <ButtonLink href="/login" variant="primary">Go to my workspace</ButtonLink>
        <ButtonLink href="/" variant="secondary">Back to home</ButtonLink>
      </>}
    />
  );
}
