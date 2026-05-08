'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EnrichPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/courrier');
  }, [router]);
  return null;
}
