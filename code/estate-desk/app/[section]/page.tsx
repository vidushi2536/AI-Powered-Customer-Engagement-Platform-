import { notFound } from 'next/navigation';
import WorkspaceApp from '../workspace-app';
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!['onboarding', 'dashboard', 'leads', 'trends'].includes(section))
    notFound();
  return (
    <WorkspaceApp
      section={section as 'onboarding' | 'dashboard' | 'leads' | 'trends'}
    />
  );
}
