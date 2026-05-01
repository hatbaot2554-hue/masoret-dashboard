import { redirect } from 'next/navigation';

export default function DashboardSourceProductRedirect({ params }: { params: { id: string } }) {
  redirect(`https://masoret-website.vercel.app/products/source/${encodeURIComponent(params.id)}`);
}
