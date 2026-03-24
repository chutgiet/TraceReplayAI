'use client';

import { FullPageError } from '@/components/states';

export default function RunError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <FullPageError error={error} reset={reset} />;
}
