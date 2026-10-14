import { notFound, redirect } from 'next/navigation';
import Workspace from '../workspace';
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!['payments', 'allocation', 'settlement', 'metrics'].includes(section)) notFound();
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === 'true') redirect('/demo');
  return <Workspace section={section} />;
}
