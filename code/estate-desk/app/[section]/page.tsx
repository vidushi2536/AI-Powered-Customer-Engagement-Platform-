import { notFound } from 'next/navigation';
import EstateApp from '../estate-app';
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    !['leads', 'properties', 'connections', 'agent', 'login'].includes(section)
  )
    notFound();
  return <EstateApp section={section} />;
}
