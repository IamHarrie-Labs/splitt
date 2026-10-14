import Workspace from '../workspace';
import { redirect } from 'next/navigation';

export default function Page() {
  if (process.env.NEXT_PUBLIC_DEMO_ONLY === 'true') redirect('/demo');
  return <Workspace section="overview" />;
}
