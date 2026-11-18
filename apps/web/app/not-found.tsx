import { FileText } from 'lucide-react';
import { NoticePage } from '../components/layout/notice-page';
import { ButtonLink } from '../components/ui';

export default function NotFound() {
  return (
    <NoticePage
      icon={FileText}
      eyebrow="Page not found"
      title="We could not find that page."
      description="The link may be outdated, or the page may not be available yet."
      actions={<ButtonLink href="/" variant="primary">Back to home</ButtonLink>}
    />
  );
}
