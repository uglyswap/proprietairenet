'use client';

import DashboardErrorBoundary from '@/components/DashboardErrorBoundary';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardErrorBoundary>{children}</DashboardErrorBoundary>;
}
