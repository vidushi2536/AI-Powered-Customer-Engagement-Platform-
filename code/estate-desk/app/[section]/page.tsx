import { notFound, redirect } from 'next/navigation';
import WorkspaceApp from '../workspace-app';
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === 'leads') redirect('/clients');
  if (section === 'viewings') redirect('/meetings');
  if (section === 'trends') redirect('/properties');
  if (
    !['onboarding', 'dashboard', 'clients', 'properties', 'meetings'].includes(
      section,
    )
  )
    notFound();
  return (
    <WorkspaceApp
      section={
        section as
          | 'onboarding'
          | 'dashboard'
          | 'clients'
          | 'properties'
          | 'meetings'
      }
    />
  );
}
